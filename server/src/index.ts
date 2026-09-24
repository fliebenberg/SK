import { recordFailure } from './utils/logger';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { dataManager } from './DataManager';
import { gameEventManager } from './managers/GameEventManager';
import {
    ActionAck,
    NO_ORGANIZER_SCOPE,
    OrganizerScope,
    SocketAction,
    findTakenDivisionName,
    organizerScopeFields,
    organizerScopeOf,
    formatInviteWait,
    inviteCooldownHoursFrom,
    inviteCooldownRemainingHours,
    isValidEmail,
    normalizeEmail,
} from '@sk/shared';
import { parseSportWriteFields } from './utils/sportValidation';
import pool from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { emailService } from './services/EmailService';
import { assetBaseUrl, assetStorage, localAssetMountPath } from './services/assetStorage';
import { issueAssetToken, requireAssetToken } from './services/assetAccess';
import { imageService } from './services/ImageService';
import { userManager } from './managers/UserManager';
import { accessManager } from './managers/AccessManager';
import { mailManager } from './managers/MailManager';
import { sportManager } from './managers/SportManager';
import { ageGroupManager, AgeGroupError } from './managers/AgeGroupManager';
import { canJoinRoom } from './wss/roomAccess';
import { broadcast, pushToSocket, setBroadcastIo } from './wss/broadcast';
import { publishGameSummary, publishGameRemoved, captureFixtureRooms, publishEventToOrgs } from './wss/fixtures';
import { tournamentManager } from './managers/TournamentManager';
import { runIdempotent, BatchRefused, BatchFailed } from './wss/batch';
import { enforceTournamentAction } from './wss/tournamentGate';
import { enforceProfileAction } from './wss/profileGate';
import { GateRefusal, enforceOrgAction } from './wss/orgGate';
import { refuseResultInFixtureEdit, validateRecordedResult } from './wss/fixtureRules';
import {
  publishAdjustments,
  publishDivision,
  publishEntrants,
  publishStageEntrants,
  publishStageFixtures,
  publishStages,
  publishStandings,
  publishOrganizerChange,
  divisionFixturesRoom,
} from './wss/tournaments';
import { canReadData } from './wss/dataAccess';
import { publishUserMemberships } from './wss/memberships';
import { attachSocketLogging } from './wss/socketLog';
import {
  divisionFacilitiesRoom,
  divisionRoom,
  eventDivisionsRoom,
  eventFacilitiesRoom,
  eventFixturesRoom,
  eventRoom,
  gameDisputesRoom,
  teamMembersRoom,
  userNotificationsRoom,
} from './wss/rooms';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
// Uploaded images are served here only while they live on this machine (MEDIA-1). Only the two
// areas are served: `public/` to anyone, `secure/` with an asset token. Names change on every
// upload, so a public file never changes and can be cached for long.
const assetMountPath = localAssetMountPath();
if (assetMountPath && assetStorage.localRoot) {
  app.use(`${assetMountPath}/public`, express.static(path.join(assetStorage.localRoot, 'public'), { maxAge: '7d' }));
  app.use(`${assetMountPath}/secure`, requireAssetToken, express.static(path.join(assetStorage.localRoot, 'secure'), { cacheControl: false }));
}

/**
 * Settings the app needs before it can render, announced by the server so that changing them needs
 * no app rebuild. `assetBaseUrl` is where uploaded images are fetched from: a path on this API, or a
 * full URL when another server holds them. Public, because signed-out screens show images too.
 */
app.get('/api/client-config', (_req, res) => {
  res.json({ assetBaseUrl });
});

// HTTP Request Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Try to extract user ID from JWT if present
  let userId = 'anonymous';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only') as any;
      if (decoded && decoded.id) {
        userId = decoded.id;
      }
    } catch {
      userId = 'invalid-token';
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - IP: ${ip} - User: ${userId} - Agent: ${userAgent} - Duration: ${duration}ms`);
  });

  next();
});

// Authentication Routes
app.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check if user exists
    const checkRes = await pool.query("SELECT id FROM users WHERE email = $1", [trimmedEmail]);
    if (checkRes.rowCount && checkRes.rowCount > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    const id = `user-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, global_role) VALUES ($1, $2, $3, $4, $5)",
      [id, name, trimmedEmail, passwordHash, 'user']
    );

    // Also add to user_emails
    await pool.query(
      "INSERT INTO user_emails (id, user_id, email, is_primary, verified_at) VALUES ($1, $2, $3, $4, NOW())",
      [`email-${Date.now()}`, id, trimmedEmail, true]
    );

    // Generate token
    const token = jwt.sign(
      { id, email: trimmedEmail, globalRole: 'user' },
      process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only',
      { expiresIn: '30d' }
    );

    const userPayload = {
      id,
      name,
      email: trimmedEmail,
      globalRole: 'user',
      hasPassword: true,
      avatarSource: null,
      customImage: null,
      theme: null,
      picture: null
    };

    return res.status(201).json({ token, user: userPayload, assetToken: issueAssetToken(id) });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const trimmedEmail = email.trim().toLowerCase();

    const dbRes = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [trimmedEmail]
    );
    const user = dbRes.rows[0];

    if (!user) {
      return res.status(401).json({ message: "EMAIL_NOT_FOUND" });
    }

    if (!user.password_hash) {
      return res.status(401).json({ message: "SOCIAL_ONLY" });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ message: "PASSWORD_MISMATCH" });
    }

    if (user.force_password_reset) {
      const tempToken = jwt.sign(
        { id: user.id, forceReset: true },
        process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only',
        { expiresIn: '15m' }
      );
      return res.status(401).json({ message: "FORCE_PASSWORD_RESET", tempToken });
    }

    // Resolve picture logic
    let picture = user.custom_image || user.image || null;
    if (user.avatar_source && user.avatar_source !== 'custom') {
      const accRes = await pool.query(
        "SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2",
        [user.id, user.avatar_source]
      );
      picture = accRes.rows[0]?.provider_image || user.image || null;
    }

    const isAdminOrCoach = await userManager.isAdminOrCoach(user.id, user.global_role);

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      globalRole: user.global_role,
      hasPassword: true,
      avatarSource: user.avatar_source,
      customImage: user.custom_image,
      theme: user.theme,
      picture,
      isAdminOrCoach
    };

    const token = jwt.sign(
      { id: user.id, email: user.email, globalRole: user.global_role },
      process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only',
      { expiresIn: '30d' }
    );

    return res.status(200).json({ token, user: userPayload, assetToken: issueAssetToken(user.id) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only');
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const dbRes = await pool.query(
      "SELECT id, name, email, global_role, password_hash, custom_image, avatar_source, theme, image FROM users WHERE id = $1",
      [decoded.id]
    );
    const user = dbRes.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Resolve picture logic
    let picture = user.custom_image || user.image || null;
    if (user.avatar_source && user.avatar_source !== 'custom') {
      const accRes = await pool.query(
        "SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2",
        [user.id, user.avatar_source]
      );
      picture = accRes.rows[0]?.provider_image || user.image || null;
    }

    const isAdminOrCoach = await userManager.isAdminOrCoach(user.id, user.global_role);

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      globalRole: user.global_role,
      hasPassword: !!user.password_hash,
      avatarSource: user.avatar_source,
      customImage: user.custom_image,
      theme: user.theme,
      picture,
      isAdminOrCoach
    };

    return res.status(200).json({ user: userPayload, assetToken: issueAssetToken(user.id) });
  } catch (error) {
    console.error("Auth verification error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Auth middleware for REST profile actions
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only') as any;
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// GET /auth/asset-token — renews the token that lets the app load images from `secure/` (MEDIA-1).
// Sign-in, sign-up and /auth/me also return one; this is for a session that outlives it.
app.get('/auth/asset-token', requireAuth, (req: any, res) => {
  res.json(issueAssetToken(req.userId));
});

// GET /auth/profile
app.get('/auth/profile', requireAuth, async (req: any, res) => {
  try {
    const userId = req.userId;
    const userRes = await pool.query(
      "SELECT id, name, email, global_role, password_hash, custom_image, avatar_source, theme, image FROM users WHERE id = $1",
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const accountsRes = await pool.query(
      "SELECT provider, provider_image FROM accounts WHERE user_id = $1",
      [userId]
    );

    const emailsRes = await pool.query(
      "SELECT email, is_primary as \"isPrimary\", verified_at as \"verifiedAt\" FROM user_emails WHERE user_id = $1",
      [userId]
    );

    let picture = user.custom_image || user.image || null;
    if (user.avatar_source && user.avatar_source !== 'custom') {
      const activeAccount = accountsRes.rows.find((a: any) => a.provider === user.avatar_source);
      picture = activeAccount?.provider_image || user.image || null;
    }

    const isAdminOrCoach = await userManager.isAdminOrCoach(user.id, user.global_role);

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.global_role,
        hasPassword: !!user.password_hash,
        avatarSource: user.avatar_source,
        customImage: user.custom_image,
        theme: user.theme,
        picture,
        isAdminOrCoach
      },
      socialAccounts: accountsRes.rows,
      emails: emailsRes.rows
    });
  } catch (error) {
    console.error("GET /auth/profile error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /auth/profile
app.patch('/auth/profile', requireAuth, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { name, theme, customImage, avatarSource } = req.body;

    const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) {
      await pool.query("UPDATE users SET name = $1 WHERE id = $2", [name, userId]);
    }

    // An empty customImage leaves the picture alone, as it always has.
    const image = await imageService.stage('profiles', customImage || undefined, userId);
    try {
      if (image.value) {
        await pool.query("UPDATE users SET custom_image = $1 WHERE id = $2", [image.value, userId]);
      }

      if (avatarSource) {
        await pool.query("UPDATE users SET avatar_source = $1 WHERE id = $2", [avatarSource, userId]);

        // Sync base 'image' for legacy and compatibility
        if (avatarSource === 'custom') {
          const activeImg = image.value || user.custom_image;
          if (activeImg) {
            await pool.query("UPDATE users SET image = $1 WHERE id = $2", [activeImg, userId]);
          }
        } else {
          const accRes = await pool.query(
            "SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2",
            [userId, avatarSource]
          );
          if (accRes.rows[0]?.provider_image) {
            await pool.query("UPDATE users SET image = $1 WHERE id = $2", [accRes.rows[0].provider_image, userId]);
          }
        }
      }
    } catch (error) {
      await image.discard();
      throw error;
    }
    // Both columns may have held the old picture; each is deleted only if nothing uses it now.
    await image.commit(user.custom_image);
    await imageService.release('profiles', user.image);

    if (theme) {
      await pool.query("UPDATE users SET theme = $1 WHERE id = $2", [theme, userId]);
    }

    // Fetch updated user to return
    const updatedRes = await pool.query(
      "SELECT id, name, email, global_role, password_hash, custom_image, avatar_source, theme, image FROM users WHERE id = $1",
      [userId]
    );
    const updatedUser = updatedRes.rows[0];
    
    let picture = updatedUser.custom_image || updatedUser.image || null;
    if (updatedUser.avatar_source && updatedUser.avatar_source !== 'custom') {
      const accRes = await pool.query(
        "SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2",
        [userId, updatedUser.avatar_source]
      );
      picture = accRes.rows[0]?.provider_image || updatedUser.image || null;
    }

    const isAdminOrCoach = await userManager.isAdminOrCoach(updatedUser.id, updatedUser.global_role);

    return res.status(200).json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        globalRole: updatedUser.global_role,
        hasPassword: !!updatedUser.password_hash,
        avatarSource: updatedUser.avatar_source,
        customImage: updatedUser.custom_image,
        theme: updatedUser.theme,
        picture,
        isAdminOrCoach
      }
    });
  } catch (error) {
    console.error("PATCH /auth/profile error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/profile/verify
app.post('/auth/profile/verify', requireAuth, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const userRes = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const hash = userRes.rows[0]?.password_hash;
    if (!hash) {
      return res.status(400).json({ message: "No password set for this account" });
    }

    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch) {
      return res.status(403).json({ message: "Incorrect password" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("POST /auth/profile/verify error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /auth/profile/password
app.patch('/auth/profile/password', requireAuth, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { password, oldPassword } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const userRes = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const existingHash = userRes.rows[0]?.password_hash;

    // If a password already exists, require the old password to match
    if (existingHash) {
      if (!oldPassword) {
        return res.status(400).json({ message: "Current password is required" });
      }

      const isMatch = await bcrypt.compare(oldPassword, existingHash);
      if (!isMatch) {
        return res.status(403).json({ message: "Incorrect current password" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("PATCH /auth/profile/password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Middleware to check for Admin Bearer JWT role
const requireAdmin = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only') as any;
    if (decoded.globalRole !== 'admin') {
      const dbRes = await pool.query("SELECT global_role FROM users WHERE id = $1", [decoded.id]);
      if (dbRes.rows[0]?.global_role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
    }
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// POST /auth/forgot-password - Secure Privacy-First recovery dispatcher
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`📬 [Forgot Password Endpoint] Request received for email: "${email}"`);
    if (!email) {
      console.log('⚠️ [Forgot Password Endpoint] Missing email in request body.');
      return res.status(400).json({ message: "Email is required" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    console.log(`📡 [Forgot Password Endpoint] Querying database for: "${trimmedEmail}"`);
    const user = await userManager.getUserByEmail(trimmedEmail);

    // Privacy-First: Always return success on the screen to prevent user enumeration
    if (!user) {
      console.log(`⚠️ [Forgot Password Endpoint] Email "${trimmedEmail}" not found in database. Returning generic success.`);
      return res.status(200).json({ success: true });
    }

    console.log(`✅ [Forgot Password Endpoint] Found matching user: Name="${user.name}", ID="${user.id}"`);

    const socialAccountRes = await pool.query(
      "SELECT provider FROM accounts WHERE user_id = $1 LIMIT 1",
      [user.id]
    );
    const socialProvider = socialAccountRes.rows[0]?.provider;
    const isSocialOnly = !user.passwordHash && !!socialProvider;
    console.log(`ℹ️ [Forgot Password Endpoint] Account status: SocialLinked=${!!socialProvider} (${socialProvider}), PasswordLinked=${!!user.passwordHash}`);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const passcode = Math.floor(100000 + Math.random() * 900000).toString();

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const hashedPasscode = crypto.createHash('sha256').update(passcode).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    console.log('📡 [Forgot Password Endpoint] Saving hashed token and passcode in database...');
    await userManager.createPasswordResetToken(user.id, hashedToken, expiresAt);
    await userManager.createPasswordResetToken(user.id, hashedPasscode, expiresAt);

    const appUrl = process.env.APP_URL || 'http://localhost:8081';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    console.log(`📧 [Forgot Password Endpoint] Dispatching transactional email: Recipient="${trimmedEmail}"`);
    const dispatchSuccess = await emailService.sendPasswordRecoveryEmail(trimmedEmail, {
      name: user.name || undefined,
      resetUrl,
      passcode,
      isSocialOnly,
      provider: socialProvider ? socialProvider.toUpperCase() : undefined
    });
    console.log(`📬 [Forgot Password Endpoint] Email dispatch completed. Success=${dispatchSuccess}`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ [Forgot Password Endpoint] Exception encountered:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/reset-password - Verify and set new credentials
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { passcode, token, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: "New password is required" });
    }

    const inputCredential = passcode || token;
    if (!inputCredential) {
      return res.status(400).json({ message: "Passcode or recovery token is required" });
    }

    const hashedCredential = crypto.createHash('sha256').update(inputCredential.trim()).digest('hex');

    const dbRes = await pool.query(
      `SELECT user_id FROM password_reset_tokens 
       WHERE token_hash = $1 AND expires_at > NOW() 
       LIMIT 1`,
      [hashedCredential]
    );

    const tokenRecord = dbRes.rows[0];
    if (!tokenRecord) {
      return res.status(400).json({ message: "Invalid or expired recovery code or token" });
    }

    const userId = tokenRecord.user_id;
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);

    await userManager.setForcePasswordReset(userId, false);
    await userManager.deletePasswordResetToken(userId);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/users/:id/temp-password - Admin-assisted recovery trigger
app.post('/api/admin/users/:id/temp-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const segment1 = Math.floor(1000 + Math.random() * 9000).toString();
    const segment2 = Math.floor(1000 + Math.random() * 9000).toString();
    const tempPassword = `Score-${segment1}-${segment2}`;

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);

    await userManager.setForcePasswordReset(id, true);
    await userManager.deletePasswordResetToken(id);

    return res.status(200).json({ 
      success: true, 
      tempPassword 
    });
  } catch (error) {
    console.error("Admin temp-password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/sports - List all sports
app.get('/api/admin/sports', requireAdmin, async (req: any, res: any) => {
  try {
    const sports = await sportManager.getSports();
    return res.json(sports);
  } catch (error) {
    console.error("Admin list sports error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/sports - Create a new sport
app.post('/api/admin/sports', requireAdmin, async (req: any, res: any) => {
  try {
    const { name, facilityTerm, periodTerm } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const fields = parseSportWriteFields(req.body);
    if ('error' in fields) {
      return res.status(400).json({ message: fields.error });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `sport-${slug}`;

    const existing = await sportManager.getSport(id);
    if (existing) {
      return res.status(400).json({ message: `A sport with name matching "${name}" already exists.` });
    }

    const createdSport = await sportManager.createSport({
      id,
      name: name.trim(),
      facilityTerm: (facilityTerm || '').trim(),
      periodTerm: (periodTerm || '').trim(),
      participantType: fields.participantType,
      matchTopology: fields.matchTopology,
      defaultSettings: fields.defaultSettings,
      eventSections: fields.eventSections,
      eventTemplates: fields.eventTemplates
    });

    return res.status(201).json(createdSport);
  } catch (error) {
    console.error("Admin create sport error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/sports/:id - Get details of a single sport
app.get('/api/admin/sports/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const sport = await sportManager.getSport(id);
    if (!sport) {
      return res.status(404).json({ message: "Sport not found" });
    }
    return res.json(sport);
  } catch (error) {
    console.error("Admin get sport error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// --- Sport age groups (admin) -------------------------------------------------------------------
// Each call writes immediately rather than riding the sport editor's Save: the list is its own
// table with teams, divisions and leagues pointing into it, and a merge is not something to stage.

const sendAgeGroupError = (res: any, error: any, label: string) => {
  if (error instanceof AgeGroupError) return res.status(400).json({ message: error.message });
  console.error(`Admin ${label} error:`, error);
  return res.status(500).json({ message: 'Internal server error' });
};

// GET /api/admin/sports/:id/age-groups - The list with usage counts and who added each custom entry
app.get('/api/admin/sports/:id/age-groups', requireAdmin, async (req: any, res: any) => {
  try {
    return res.json(await ageGroupManager.getAdminList(req.params.id));
  } catch (error) {
    return sendAgeGroupError(res, error, 'list age groups');
  }
});

// POST /api/admin/sports/:id/age-groups - Add to the official list (promotes a custom entry of that name)
app.post('/api/admin/sports/:id/age-groups', requireAdmin, async (req: any, res: any) => {
  try {
    if (!(await sportManager.getSport(req.params.id))) {
      return res.status(404).json({ message: 'Sport not found' });
    }
    await ageGroupManager.addOfficial(req.params.id, req.body?.name);
    return res.status(201).json(await ageGroupManager.getAdminList(req.params.id));
  } catch (error) {
    return sendAgeGroupError(res, error, 'add age group');
  }
});

// PUT /api/admin/sports/:id/age-groups/order - Reorder the official list
app.put('/api/admin/sports/:id/age-groups/order', requireAdmin, async (req: any, res: any) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== 'string')) {
      return res.status(400).json({ message: 'ids must be a list of age group ids.' });
    }
    await ageGroupManager.reorder(req.params.id, ids);
    return res.json(await ageGroupManager.getAdminList(req.params.id));
  } catch (error) {
    return sendAgeGroupError(res, error, 'reorder age groups');
  }
});

// PATCH /api/admin/age-groups/:id - Rename, promote to official, or demote to custom
app.patch('/api/admin/age-groups/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { name, isOfficial } = req.body || {};
    if (isOfficial !== undefined && typeof isOfficial !== 'boolean') {
      return res.status(400).json({ message: 'isOfficial must be true or false.' });
    }
    const updated = await ageGroupManager.update(req.params.id, { name, isOfficial });
    if (!updated) return res.status(404).json({ message: 'Age group not found' });
    return res.json(await ageGroupManager.getAdminList(updated.sportId));
  } catch (error) {
    return sendAgeGroupError(res, error, 'update age group');
  }
});

// DELETE /api/admin/age-groups/:id - Only an entry nothing holds
app.delete('/api/admin/age-groups/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const existing = await ageGroupManager.getAgeGroup(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Age group not found' });
    await ageGroupManager.delete(req.params.id);
    return res.json(await ageGroupManager.getAdminList(existing.sportId));
  } catch (error) {
    return sendAgeGroupError(res, error, 'delete age group');
  }
});

// POST /api/admin/age-groups/:id/merge - Move everything holding :id to intoId, then delete :id
app.post('/api/admin/age-groups/:id/merge', requireAdmin, async (req: any, res: any) => {
  try {
    const existing = await ageGroupManager.getAgeGroup(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Age group not found' });
    const intoId = req.body?.intoId;
    if (typeof intoId !== 'string' || !intoId) {
      return res.status(400).json({ message: 'Choose the age group to merge into.' });
    }
    const { moved } = await ageGroupManager.merge(req.params.id, intoId);
    return res.json({ moved, ageGroups: await ageGroupManager.getAdminList(existing.sportId) });
  } catch (error) {
    return sendAgeGroupError(res, error, 'merge age groups');
  }
});

// PATCH /api/admin/sports/:id - Update a sport's settings
app.patch('/api/admin/sports/:id', requireAdmin, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, facilityTerm, periodTerm } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const fields = parseSportWriteFields(req.body);
    if ('error' in fields) {
      return res.status(400).json({ message: fields.error });
    }

    const updatedSport = await sportManager.updateSport(id, {
      name: name.trim(),
      facilityTerm: (facilityTerm || '').trim(),
      periodTerm: (periodTerm || '').trim(),
      participantType: fields.participantType,
      matchTopology: fields.matchTopology,
      defaultSettings: fields.defaultSettings,
      eventSections: fields.eventSections,
      eventTemplates: fields.eventTemplates
    });

    if (!updatedSport) {
      return res.status(404).json({ message: "Sport not found" });
    }

    return res.json(updatedSport);
  } catch (error) {
    console.error("Admin update sport error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/users/search - Search across users and organization members
app.get('/api/admin/users/search', requireAdmin, async (req: any, res: any) => {
  try {
    const { name, email, id, page, limit } = req.query;

    const nameParam = (typeof name === 'string' && name.trim()) ? name.trim() : null;
    const emailParam = (typeof email === 'string' && email.trim()) ? email.trim() : null;
    const idParam = (typeof id === 'string' && id.trim()) ? id.trim() : null;

    let parsedPage = parseInt(page as string, 10);
    if (isNaN(parsedPage) || parsedPage < 1) parsedPage = 1;

    let parsedLimit = parseInt(limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 50) parsedLimit = 50;
    if (parsedLimit > 200) parsedLimit = 200;

    const offset = (parsedPage - 1) * parsedLimit;

    // Return empty results immediately if no search criteria is provided
    if (!nameParam && !emailParam && !idParam) {
      return res.json({
        results: [],
        totalCount: 0,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: 0
      });
    }

    const nameLike = nameParam ? `%${nameParam}%` : null;
    const emailLike = emailParam ? `%${emailParam}%` : null;
    const idLike = idParam ? `%${idParam}%` : null;

    const queryStr = `
      WITH user_candidates AS (
        SELECT 
          'user' AS type,
          u.id AS id,
          u.name AS name,
          u.email AS email,
          u.global_role AS "globalRole",
          u.image AS image,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', op.id,
                'orgId', op.org_id,
                'orgName', org.name,
                'name', op.name,
                'email', op.email,
                'cellphone', op.cellphone,
                'nationalId', op.national_id,
                'identifier', op.identifier
              )
            ) FILTER (WHERE op.id IS NOT NULL),
            '[]'::json
          ) AS profiles,
          COALESCE(
            json_agg(DISTINCT ue.email) FILTER (WHERE ue.email IS NOT NULL),
            '[]'::json
          ) AS "linkedEmails",
          MAX(CASE WHEN $1::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN u.name ILIKE $2::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.name ILIKE $2::text THEN 1.0 ELSE 0.0 END,
              similarity(COALESCE(u.name, ''), $1::text),
              similarity(COALESCE(op.name, ''), $1::text)
            )
          ELSE 0.0 END) AS name_score,
          MAX(CASE WHEN $3::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN u.email ILIKE $4::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN ue.email ILIKE $4::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.email ILIKE $4::text THEN 1.0 ELSE 0.0 END,
              similarity(COALESCE(u.email, ''), $3::text),
              similarity(COALESCE(ue.email, ''), $3::text),
              similarity(COALESCE(op.email, ''), $3::text)
            )
          ELSE 0.0 END) AS email_score,
          MAX(CASE WHEN $5::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN op.national_id ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.identifier ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.cellphone ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN u.id ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.id ILIKE $6::text THEN 1.0 ELSE 0.0 END
            )
          ELSE 0.0 END) AS id_score
        FROM users u
        LEFT JOIN user_emails ue ON u.id = ue.user_id
        LEFT JOIN org_profiles op ON u.id = op.user_id
        LEFT JOIN organizations org ON op.org_id = org.id
        GROUP BY u.id
      ),
      member_candidates AS (
        SELECT 
          'member' AS type,
          op.id AS id,
          op.name AS name,
          op.email AS email,
          NULL AS "globalRole",
          op.image AS image,
          json_build_array(
            jsonb_build_object(
              'id', op.id,
              'orgId', op.org_id,
              'orgName', org.name,
              'name', op.name,
              'email', op.email,
              'cellphone', op.cellphone,
              'nationalId', op.national_id,
              'identifier', op.identifier
            )
          ) AS profiles,
          '[]'::json AS "linkedEmails",
          (CASE WHEN $1::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN op.name ILIKE $2::text THEN 1.0 ELSE 0.0 END,
              similarity(op.name, $1::text)
            )
          ELSE 0.0 END) AS name_score,
          (CASE WHEN $3::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN op.email ILIKE $4::text THEN 1.0 ELSE 0.0 END,
              similarity(COALESCE(op.email, ''), $3::text)
            )
          ELSE 0.0 END) AS email_score,
          (CASE WHEN $5::text IS NOT NULL THEN
            GREATEST(
              CASE WHEN op.national_id ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.identifier ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.cellphone ILIKE $6::text THEN 1.0 ELSE 0.0 END,
              CASE WHEN op.id ILIKE $6::text THEN 1.0 ELSE 0.0 END
            )
          ELSE 0.0 END) AS id_score
        FROM org_profiles op
        LEFT JOIN organizations org ON op.org_id = org.id
        WHERE op.user_id IS NULL
      ),
      all_candidates AS (
        SELECT * FROM user_candidates
        UNION ALL
        SELECT * FROM member_candidates
      )
      SELECT 
        type, id, name, email, "globalRole", image, profiles, "linkedEmails",
        (name_score + email_score + id_score) AS "matchScore",
        COUNT(*) OVER()::int AS "totalCount"
      FROM all_candidates
      WHERE 
        (
          ($1::text IS NOT NULL AND name_score > 0.05) OR
          ($3::text IS NOT NULL AND email_score > 0.05) OR
          ($5::text IS NOT NULL AND id_score > 0.05)
        )
      ORDER BY "matchScore" DESC, name ASC
      LIMIT $7 OFFSET $8;
    `;

    const dbRes = await pool.query(queryStr, [
      nameParam, nameLike,
      emailParam, emailLike,
      idParam, idLike,
      parsedLimit, offset
    ]);

    const results = dbRes.rows;
    const totalCount = results.length > 0 ? results[0].totalCount : 0;
    const cleanedResults = results.map(({ totalCount, ...rest }) => rest);
    const totalPages = Math.ceil(totalCount / parsedLimit);

    return res.json({
      results: cleanedResults,
      totalCount,
      page: parsedPage,
      limit: parsedLimit,
      totalPages
    });
  } catch (error) {
    console.error("Admin user search error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1e7, // 10MB
  cors: {
    origin: "*", // allow all for now
    methods: ["GET", "POST"]
  }
});

/**
 * Enforce `get_data` authorization rather than only logging what it would
 * refuse. Left off until the log-only pass has shaken out every screen that
 * reads data it has no membership for.
 */
const GET_DATA_ENFORCE = process.env.GET_DATA_ENFORCE === 'true';
console.log(`[DataAccess] get_data authorization: ${GET_DATA_ENFORCE ? 'ENFORCING' : 'log-only'}`);

// Wire the broadcaster to the server before anything can publish through it.
setBroadcastIo(io);

// Socket.io Connection Middleware (logs connections and tries to resolve user identity)
io.use((socket, next) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'unknown';
  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
  
  // Handshake authentication token check
  let userId = 'anonymous';
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token as string, process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only') as any;
      if (decoded && decoded.id) {
        userId = decoded.id;
      }
    } catch {
      userId = 'invalid-token';
    }
  }

  (socket as any).clientIp = clientIp;
  (socket as any).userAgent = userAgent;
  (socket as any).userId = userId;
  // Also on `socket.data`, which is the only part that survives onto the
  // `RemoteSocket` objects `io.fetchSockets()` returns - room revalidation
  // needs to know whose socket it is looking at.
  socket.data.userId = userId;

  console.log(`[Socket] Connection established: ID=${socket.id} IP=${clientIp} User=${userId} Agent=${userAgent}`);
  next();
});

const PORT = process.env.PORT || 3001;

/**
 * Live-match mutations, mapped to the game they act on. Every one of these is
 * authorized with `canScoreGame` against the identity proven by the socket
 * handshake — never against anything in the payload, which the client controls.
 */
const SCORING_ACTION_GAME_ID: Partial<Record<SocketAction, (payload: any) => string | undefined>> = {
  [SocketAction.ADD_GAME_EVENT]: (p) => p?.gameId,
  [SocketAction.UPDATE_GAME_EVENT]: (p) => p?.gameId,
  [SocketAction.UNDO_GAME_EVENT]: (p) => p?.gameId,
  [SocketAction.INITIATE_UNDO_VOTE]: (p) => p?.gameId,
  [SocketAction.INITIATE_UPDATE_VOTE]: (p) => p?.gameId,
  [SocketAction.CAST_UNDO_VOTE]: (p) => p?.gameId,
  [SocketAction.CAST_UPDATE_VOTE]: (p) => p?.gameId,
  [SocketAction.UPDATE_GAME_CLOCK]: (p) => p?.id,
  [SocketAction.UPDATE_GAME_SCORE]: (p) => p?.id,
  [SocketAction.UPDATE_GAME_STATUS]: (p) => p?.id,
  // `canScoreGame` already admits the host's admins and staff, event organisers and division
  // convenors — so the people who edit a fixture may record its result as well (2026-09-21).
  [SocketAction.RECORD_GAME_RESULT]: (p) => p?.id,
  [SocketAction.RESET_GAME]: (p) => p?.id,
  [SocketAction.REMOVE_SIN_BIN]: (p) => p?.gameId,
  [SocketAction.SAVE_GAME_ROSTER]: (p) => p?.gameId,
};

/**
 * Tournament writes are gated in [wss/tournamentGate.ts](./wss/tournamentGate.ts).
 *
 * Both scope maps and the decision moved there in Phase 4, for the reason the module explains: a
 * gate nobody can call is a gate nobody can test, and the exit criterion for organiser permissions
 * is a list of refusals that have to be checked against the code the socket actually runs.
 */

/**
 * Payload fields naming the org profile the caller claims to be acting as.
 * Attributing an action to somebody else's profile would let a client forge who
 * scored an event or who cast a consensus vote, so each is checked for
 * ownership. `actorOrgProfileId` is intentionally absent: it identifies the
 * player an event is about, not the person submitting it.
 */
const CALLER_PROFILE_FIELDS = ['initiatorOrgProfileId', 'initiatorId', 'officialId'] as const;

/** Carries a refusal out of `runIdempotent`, which remembers only what resolves. */
class RefusedAck extends Error {
    constructor(public readonly ack: ActionAck) {
        super(ack.status === 'error' ? ack.message : 'Refused');
    }
}

/**
 * Write one entry to a game's log and publish it — what `ADD_GAME_EVENT` does, and what a status or
 * clock change does for its own log entry. Throws the manager's refusal, so the action answers it.
 */
async function recordGameEvent(data: {
    gameId: string;
    type: string;
    subType?: string;
    eventData?: any;
    initiatorOrgProfileId?: string;
    actorOrgProfileId?: string;
    gameParticipantId?: string;
}) {
    const eventRes = await gameEventManager.ingestEvent(data);
    if ('error' in eventRes) {
        console.error('Server: Failed to ingest game event:', eventRes.error);
        throw new Error(eventRes.error);
    }
    // Broadcast the granular event to the base game room and detail room
    broadcast(`game:${data.gameId}`, 'GAME_EVENT_ADDED', eventRes);
    broadcast(`game:${data.gameId}:events`, 'GAME_EVENT_ADDED', eventRes);

    // Broadcast updated game state to the detail room and base game room
    const updatedGame = await dataManager.getGame(data.gameId);
    if (updatedGame) {
        broadcast(`game:${data.gameId}`, 'GAME_UPDATED', updatedGame);
    }
    // A recorded score changes what every fixture list shows.
    await publishGameSummary(data.gameId);
    return eventRes;
}

/**
 * The log entry a status or clock change asked for, written only after the change applied (SYNC-4).
 * The client used to send it as a second action beside the change, so a refused "start" could still
 * log `GAME_STARTED`. If the change applied but its entry cannot be written, the action says so
 * rather than reporting a clean success.
 */
async function recordChangeInLog(
    payload: { id: string; log?: { subType: string; eventData?: any }; initiatorOrgProfileId?: string },
    type: 'STATUS' | 'TIME'
) {
    if (!payload.log?.subType) return;
    try {
        await recordGameEvent({
            gameId: payload.id,
            type,
            subType: payload.log.subType,
            eventData: payload.log.eventData,
            initiatorOrgProfileId: payload.initiatorOrgProfileId,
        });
    } catch (error: any) {
        throw new Error(`The change was applied, but it could not be added to the game log: ${error.message}`);
    }
}

/**
 * A tournament's sports and divisions move together (U52).
 *
 * The invariant, held here rather than in any one screen: **every sport the tournament includes
 * has at least one division, and every division plays one of the tournament's sports.** The four
 * helpers below are the four places it can break.
 *
 * - A sport chosen — at creation or later — with no division gets one (`createSportDivisions`).
 * - A sport cannot be removed while a division plays it (`assertSportsRemovable`); the organiser
 *   deletes those divisions first, which the Sports & Divisions screen offers to do for them.
 * - A division must name one of the tournament's sports (`assertDivisionSportAllowed`).
 * - When a sport's last division is deleted or moved to another sport, the sport goes with it
 *   (`removeSportIfUnused`), and the screen warns before that happens.
 *
 * Each division created is published as it lands; a failure is reported to the caller, because a
 * sport that silently never got its division is exactly the inconsistency this exists to prevent.
 */
async function createSportDivisions(event: any, sportIds: string[]): Promise<void> {
    if (!sportIds.length) return;
    const existing = await dataManager.getDivisions(event.id);
    const needing = sportIds.filter(sportId => !existing.some(d => d.sportId === sportId));
    const created = await tournamentManager.createDivisionsForSports(event, needing);
    for (const division of created) {
        await publishDivision(division.id, 'DIVISION_ADDED', await dataManager.getDivisionDetail(division.id), event.id);
    }
}

async function assertSportsRemovable(eventId: string, previousSportIds: string[], nextSportIds: string[]): Promise<void> {
    const removed = previousSportIds.filter(id => !nextSportIds.includes(id));
    if (!removed.length) return;
    const divisions = await dataManager.getDivisions(eventId);
    for (const sportId of removed) {
        const playing = divisions.filter(d => d.sportId === sportId).map(d => d.name);
        if (!playing.length) continue;
        const sportName = (await dataManager.getSport(sportId))?.name || 'That sport';
        const list = playing.length > 1
            ? `${playing.slice(0, -1).join(', ')} and ${playing[playing.length - 1]}`
            : playing[0];
        throw new Error(
            `${sportName} still has ${playing.length > 1 ? 'divisions' : 'a division'}: ${list}. ` +
            `Delete ${playing.length > 1 ? 'them' : 'it'} before removing ${sportName} from the tournament.`
        );
    }
}

/**
 * Whether a division may play `sportId` — one of its tournament's sports.
 *
 * The division's current sport is always allowed, so a division from before U52 whose sport the
 * tournament does not list can still be saved without being forced off it.
 */
async function assertDivisionSportAllowed(eventId: string | null | undefined, sportId?: string, currentSportId?: string) {
    if (!eventId || !sportId || sportId === currentSportId) return;
    const event = await dataManager.getEvent(eventId);
    if (!(event?.sportIds || []).includes(sportId)) {
        throw new Error("That sport is not one of this tournament's sports. Add it under Sports & Divisions first.");
    }
}

async function removeSportIfUnused(eventId: string | null | undefined, sportId?: string | null): Promise<void> {
    if (!eventId || !sportId) return;
    const divisions = await dataManager.getDivisions(eventId);
    if (divisions.some(d => d.sportId === sportId)) return;
    const event = await dataManager.getEvent(eventId);
    if (!event || !(event.sportIds || []).includes(sportId)) return;
    const updated = await dataManager.updateEvent(eventId, {
        sportIds: (event.sportIds || []).filter(id => id !== sportId),
    });
    if (!updated) return;
    publishEventToOrgs([updated.orgId, ...(updated.participatingOrgIds || [])], 'EVENT_UPDATED', updated);
    broadcast(eventRoom(updated.id), 'EVENT_UPDATED', updated);
}

/**
 * A division's organisers, each marked with whether *this caller* may withdraw them (D33, revised
 * 2026-09-19). Anyone who may edit the event may withdraw anybody; a convenor only the people they
 * appointed. Only ever sent to the one caller it was computed for.
 */
async function divisionOrganizersFor(userId: string | null | undefined, divisionId: string): Promise<any[]> {
    const rows = await dataManager.getDivisionOrganizers(divisionId);
    const eventId = await dataManager.getDivisionEventId(divisionId);
    return markWithdrawable(userId, eventId, rows);
}

/**
 * A sport's organisers, marked the same way (2026-09-20).
 *
 * The rule is the one the division list already applies, one scope up: a sport's organiser may add
 * co-organisers of their sport and remove only the ones they added, so the answer depends on the
 * viewer and is computed per caller rather than stored on the row.
 */
async function sportOrganizersFor(
    userId: string | null | undefined,
    eventId: string,
    sportId: string
): Promise<any[]> {
    return markWithdrawable(userId, eventId, await dataManager.getSportOrganizers(eventId, sportId));
}

/** `canWithdraw` for one caller over one list. Never published to a room — it is one viewer's answer. */
async function markWithdrawable(
    userId: string | null | undefined,
    eventId: string | null | undefined,
    rows: any[]
): Promise<any[]> {
    if (!userId) return rows.map((row: any) => ({ ...row, canWithdraw: false }));
    const event = eventId ? await dataManager.getEvent(eventId) : null;
    const actsForEvent = !!event && await dataManager.canEditEventOrGame(userId, event.orgId, event.id);
    return Promise.all(rows.map(async (row: any) => ({
        ...row,
        canWithdraw: actsForEvent || (!!row.grantedByOrgProfileId &&
            await dataManager.ownsOrgProfile(userId, row.grantedByOrgProfileId)),
    })));
}

/** The tournament an appointment scope belongs to — the id every publish and audit lookup needs. */
async function organizerScopeEventId(scope: OrganizerScope): Promise<string | null> {
    return scope.kind === 'division'
        ? dataManager.getDivisionEventId(scope.divisionId)
        : scope.eventId;
}

/**
 * The sport whose grant may be the one the appointer is acting through.
 *
 * A sport-scope appointment names it. A division-scope one does not, but a sport's organiser
 * appointing a convenor to one of their divisions is acting through their sport grant, so the
 * division's own sport is what `resolveGrantingProfile` has to be offered. An event-scope
 * appointment is never made through a sport grant.
 */
async function grantingSportFor(scope: OrganizerScope): Promise<string | undefined> {
    if (scope.kind === 'sport') return scope.sportId;
    if (scope.kind === 'division') {
        return (await dataManager.getDivision(scope.divisionId))?.sportId || undefined;
    }
    return undefined;
}

/**
 * The list an appointment or withdrawal answers with, as *this caller* should see it.
 *
 * The narrow scopes carry `canWithdraw`, which is one viewer's answer and so is recomputed rather
 * than taken from the write's return value. The event scope has no per-row rule, so the list the
 * write already produced is the list.
 */
async function organizersForCaller(
    userId: string | null | undefined,
    scope: OrganizerScope,
    written: any[]
): Promise<any[]> {
    if (scope.kind === 'division') return divisionOrganizersFor(userId, scope.divisionId);
    if (scope.kind === 'sport') return sportOrganizersFor(userId, scope.eventId, scope.sportId);
    return written;
}

/**
 * Stop a sport's organiser deleting the last division of their own sport (2026-09-20).
 *
 * Deleting a sport's last division removes the sport from the tournament (U52) - which is a
 * decision about the tournament, not about the sport, and so is not theirs. Everything either side
 * of that line is: they may add netball divisions, and delete any netball division while another
 * remains.
 *
 * Checked here rather than in the gate because the gate asks what a payload *touches*, and "is this
 * the last one" is a fact about the rest of the tournament. It is the same shape as the
 * "withdraw only whom you appointed" rule, and for the same reason.
 */
async function assertNotLastDivisionOfDelegatedSport(
    userId: string | null | undefined,
    actingOrgId: string | undefined,
    division: { id: string; eventId: string; sportId?: string; name?: string } | null | undefined
): Promise<void> {
    if (!userId || !division?.sportId || !division.eventId) return;

    const event = await dataManager.getEvent(division.eventId);
    if (!event) return;
    // An event organiser may do this, and the dialog on the setup screen tells them what it means.
    if (await dataManager.canEditEventOrGame(userId, actingOrgId || event.orgId, event.id)) return;

    const siblings = (await dataManager.getDivisions(division.eventId))
        .filter(d => d.id !== division.id && d.sportId === division.sportId);
    if (siblings.length > 0) return;

    const sportName = (await dataManager.getSport(division.sportId))?.name || 'that sport';
    throw new Error(
        `Deleting the last ${sportName} division would take ${sportName} out of the tournament, which the tournament's organisers decide. Ask them to remove it.`
    );
}

/**
 * Refuse a division name another division in the same tournament already has, ignoring case and
 * surrounding space. The division screen checks as the name is typed; this is what holds when two
 * people save at once, or a caller skips the screen.
 */
async function assertDivisionNameFree(eventId: string | null | undefined, name: string | undefined, exceptDivisionId?: string) {
    if (!eventId || name === undefined) return;
    if (!name.trim()) throw new Error('A division needs a name.');
    const others = (await dataManager.getDivisions(eventId)).filter(d => d.id !== exceptDivisionId);
    const clash = findTakenDivisionName(name, others.map(d => d.name));
    if (clash) {
        throw new Error(`Another division in this tournament is already called "${clash}". Division names must be different.`);
    }
}

io.on('connection', (socket) => {
  // Every incoming event, every ack and every message pushed to this socket. Broadcasts are logged
  // in `broadcast()` instead, since a room fan-out never touches one socket's `emit`. Off in
  // production by default - see `SOCKET_LOG` in wss/socketLog.ts.
  attachSocketLogging(socket);

  console.log('Client connected [v2]:', socket.id);

  // Send server timestamp on connection for client time offset calculation
  socket.emit('server_time', { serverTime: Date.now() });

  socket.on('time_sync', (_, callback) => {
    if (typeof callback === 'function') {
      callback({ serverTime: Date.now() });
    }
  });
  
    socket.on('get_live_games', async (data, callback) => {
        try {
            const games = await dataManager.getLiveGames();
            callback(games);
        } catch (error) {
            console.error('Error fetching live games:', error);
            callback([]);
        }
    });

    socket.on('get_data', async (request, callback) => {
      // The destructure below throws on a null or non-object payload, and it sits outside the
      // try blocks that follow — so an emit with no request ended the process. Same defect as
      // `SOCK-1`, checked here for the same reason.
      if (!request || typeof request !== 'object') {
        console.warn(`[Socket] Malformed get_data payload from ${socket.id}: ${JSON.stringify(request)}`);
        if (callback) callback({ status: 'error', error: 'BadRequest', message: 'Malformed request.' });
        return;
      }

      const { type, orgId, id, teamId } = request;
      console.log(`Server: get_data requested: ${JSON.stringify(request)}`);

      // `get_data` is the query half of the read boundary; rooms are the other.
      // Running log-only while the rules are shaken out: the decision is made and
      // every refusal logged, but nothing is blocked. GET_DATA_ENFORCE=true flips it.
      try {
        const readerId = socket.data?.userId || 'anonymous';
        const decision = await canReadData(readerId, request);
        if (!decision.allowed) {
          console.warn(
            `[DataAccess]${GET_DATA_ENFORCE ? ' REFUSED' : ' WOULD-REFUSE'} type=${type} user=${readerId} reason=${decision.reason} request=${JSON.stringify(request)}`
          );
          if (GET_DATA_ENFORCE) {
            if (callback) callback({ status: 'error', error: 'Unauthorized', message: 'You do not have permission to read this data.' });
            return;
          }
        }
      } catch (checkErr) {
        console.error('[DataAccess] check failed for', JSON.stringify(request), checkErr);
        if (GET_DATA_ENFORCE) {
          if (callback) callback({ status: 'error', error: 'Unauthorized', message: 'Permission check failed.' });
          return;
        }
      }

      try {
        switch(type) {
            case 'organizations':
                callback(await dataManager.getOrganizations(request));
                break;
            case 'reports':
                // Check if user is app admin
                if (id && await dataManager.isAppAdmin(id)) {
                    callback(await dataManager.getReports(request.entityType));
                } else {
                    callback([]);
                }
                break;
            case 'organization':
            case 'org_summary':
                // Both spellings, because both are in use: most callers send `id`, but six
                // screens send `orgId` and were silently answered `undefined` until 2026-09-01
                // (`DATA-4`) — which left `isOwner` permanently false wherever it was computed
                // from the result. Same shape as `facilities` below, and widening the handler
                // rather than correcting the callers is what stops the next one repeating it.
                callback(await dataManager.getOrganization(id || orgId));
                break;
            case 'teams':
                callback(await dataManager.getTeams(orgId));
                break;
            case 'team':
                callback(await dataManager.getTeam(id));
                break;
            case 'sites':
                callback(await dataManager.getSites(orgId));
                break;
            case 'site':
                callback(await dataManager.getSite(id));
                break;
            case 'facilities':
                // Scoped by site when one is named, otherwise by org - never an unfiltered global read
                if (!id && !request.siteId && orgId) {
                    callback(await dataManager.getFacilitiesByOrg(orgId));
                } else {
                    callback(await dataManager.getFacilities(id || request.siteId));
                }
                break;
            case 'facility':
                callback(await dataManager.getFacility(id));
                break;
            case 'games':
                callback(await dataManager.getGames(orgId));
                break;
            case 'team_games':
                callback(await dataManager.getGamesByTeam(request.teamId || id));
                break;
            case 'game':
                callback(await dataManager.getGame(id));
                break;
            case 'game_events':
                callback(await dataManager.getGameEvents(id, request.fromSequence, request.limit));
                break;
            case 'active_disputes':
                const activeDisputes = await gameEventManager.getActiveDisputes(id);
                console.log(`[Socket] Returning ${activeDisputes.length} active disputes for game ${id}`);
                callback(activeDisputes);
                break;
            case 'game_roster':
            case 'roster':
                callback(await dataManager.getGameRoster(id));
                break;
            case 'events':
                callback(await dataManager.getEvents(orgId));
                break;
            case 'event':
                callback(await dataManager.getEvent(id));
                break;
            case 'leagues':
                callback(await dataManager.getLeagues(orgId || request.orgId));
                break;
            case 'league':
                callback(await dataManager.getLeague(id));
                break;
            case 'seasons':
                callback(await dataManager.getSeasons(request.leagueId));
                break;
            case 'season':
                callback(await dataManager.getSeason(id));
                break;
            case 'season_standings':
                const seasonObj = await dataManager.getSeason(id);
                callback(seasonObj?.cachedStandings || []);
                break;
            case 'season_teams':
                callback(await dataManager.getSeasonTeams(request.seasonId));
                break;
            case 'season_games':
                callback(await dataManager.getSeasonGames(request.seasonId));
                break;
            case 'sports':
                callback(await dataManager.getSports());
                break;
            case 'sport':
                callback(await dataManager.getSport(id));
                break;
            case 'roles':
                callback({
                    team: await dataManager.getTeamRoles(),
                    org: await dataManager.getOrganizationRoles()
                });
                break;
            case 'org_profiles':
                // Avoid sending ALL profiles. 
                callback([]); 
                break;
            case 'org_members':
                if (orgId) {
                    const members = await dataManager.getOrganizationMembers(orgId);
                    console.log(`Server: Returning ${members.length} members for org ${orgId}`);
                    callback(members);
                } else {
                    console.warn("Server: org_members requested without orgId");
                    callback([]);
                }
                break;
            case 'team_members':
                // Fetch members for a specific team strictly via teamId
                if (teamId) {
                    callback(await dataManager.getTeamMembers(teamId));
                } else {
                    console.warn("Server: team_members requested without teamId");
                    callback([]);
                }
                break;
            case 'team_memberships':
                // Deprecated global fetch
                callback([]);
                break;
            case 'org_memberships':
                callback([]); // Deprecated global fetch
                break;
            case 'user_memberships':
                if (id) {
                    const [orgs, teams] = await Promise.all([
                        dataManager.getUserOrgMemberships(id),
                        dataManager.getUserTeamMemberships(id)
                    ]);
                    // Combine into unified list or send separate?
                    // Let's assume client expects list of memberships
                    // Wait, getUserOrgMemberships returns OrgMembership[]
                    callback({ orgs, teams }); 
                } else {
                    callback({});
                }
                break;

            case 'search_similar_orgs':
                if (request.name) {
                    callback(await dataManager.searchSimilarOrganizations(request.name));
                } else {
                    callback([]);
                }
                break;
            case 'search_people':
                if (request.query) {
                    // `PEOPLE-1`. Contact and identity fields come back only when the search is
                    // scoped to an org **and the caller belongs to it** — which is what the three
                    // screens using this are doing when they pre-fill a member form from an
                    // existing profile. Every other search, including the unscoped one that finds
                    // a person to invite, gets name, organisation and image.
                    const searchScopeOrgId = request.orgId;
                    const searchLean =
                        !searchScopeOrgId ||
                        !(await dataManager.isOrgMember(socket.data?.userId, searchScopeOrgId));
                    callback(await dataManager.searchPeople(request.query, searchScopeOrgId, { lean: searchLean }));
                } else {
                    callback([]);
                }
                break;
            case 'find_matching_user':
                callback(await dataManager.findMatchingUser(request.email, request.name, request.birthdate));
                break;
            case 'pending_claims':
                // Check for pending claims for the user's email(s)
                // Using request.email for now, assuming client sends it
                if (request.email) {
                    callback(await dataManager.getPendingClaimForUser(request.email));
                } else {
                    callback([]);
                }
                break;
            case 'claim_info':
                if (request.token) {
                    callback(await dataManager.getClaimInfo(request.token));
                } else {
                    callback(null);
                }
                break;
            case 'notifications':
                if (id) { // assuming id is userId
                    callback(await dataManager.getNotifications(id));
                } else {
                    callback([]);
                }
                break;
            case 'org_claim_status':
                if (orgId) {
                    callback(await dataManager.getOrgClaimStatus(orgId, socket.data?.userId));
                } else {
                    callback(null);
                }
                break;
            case 'org_referrals':
                console.log(`Server: Processing org_referrals for ${orgId}`);
                if (orgId) {
                    const result = await dataManager.getReferralsForOrg(orgId);
                    console.log(`Server: Found ${result.length} referrals`);
                    callback(result);
                } else {
                    console.warn(`Server: Missing orgId for org_referrals`);
                    callback([]);
                }
                break;
            // --- Tournaments (Phase 3) -----------------------------------------------
            // Every one of these is classified in `wss/dataAccess.ts` against the room that owns
            // it. Under `GET_DATA_ENFORCE` an unmapped type is refused, so adding a case here
            // without a rule there simply fails on its first call — which is the safety net
            // working, not an obstacle.
            case 'divisions':
                callback(request.eventId ? await dataManager.getDivisions(request.eventId) : []);
                break;
            case 'division':
                callback(request.divisionId ? await dataManager.getDivisionDetail(request.divisionId) : null);
                break;
            case 'division_stages':
                callback(request.divisionId ? await dataManager.getStages(request.divisionId) : []);
                break;
            case 'division_entrants':
                callback(request.divisionId ? await dataManager.getDivisionEntrants(request.divisionId) : []);
                break;
            case 'division_adjustments':
                callback(request.divisionId ? await dataManager.getDivisionAdjustments(request.divisionId) : []);
                break;
            case 'division_games':
                callback(request.divisionId ? await dataManager.getDivisionGames(request.divisionId) : []);
                break;
            case 'division_facilities':
                callback(request.divisionId ? await dataManager.getDivisionFacilities(request.divisionId) : []);
                break;
            case 'division_standings': {
                const standingsStages = request.divisionId ? await dataManager.getStages(request.divisionId) : [];
                callback(standingsStages.map(stage => ({
                    stageId: stage.id,
                    name: stage.name,
                    status: stage.status,
                    rows: stage.cachedStandings || [],
                })));
                break;
            }
            case 'stage':
                callback(request.stageId ? await dataManager.getStage(request.stageId) : null);
                break;
            case 'stage_entrants':
                callback(request.stageId ? await dataManager.getStageEntrants(request.stageId) : []);
                break;
            case 'stage_games':
                callback(request.stageId ? await dataManager.getStageGames(request.stageId) : []);
                break;
            case 'event_facilities':
                callback(request.eventId ? await dataManager.getEventFacilities(request.eventId) : []);
                break;
            // --- Entry (Phase 6) ---------------------------------------------------
            case 'event_entrants':
                callback(request.eventId ? await dataManager.getEventEntrants(request.eventId) : []);
                break;
            case 'event_candidate_teams': {
                // A convenor addresses it by their division; an organiser by the event. Either way
                // the answer is the whole event's teams — the client filters by the division's
                // sport and age group, because the org axis shows every division at once.
                const candidateEventId =
                    request.eventId ||
                    (request.divisionId ? await dataManager.getDivisionEventId(request.divisionId) : null);
                callback(
                    candidateEventId
                        ? await dataManager.getEventCandidateTeams(candidateEventId)
                        : { teams: [], orgs: [] }
                );
                break;
            }
            case 'event_standings': {
                const standingsEvent = request.eventId ? await dataManager.getEvent(request.eventId) : null;
                callback((standingsEvent as any)?.cachedStandings || []);
                break;
            }
            // --- Permissions (Phase 4) ---------------------------------------------
            // The identity is the socket's, never anything in the request: there is no way to ask
            // what somebody else may do, which is why this needs no gate beyond being signed in.
            // The same identity rule as `event_capabilities`, asked across every event at once: a
            // fixtures list needs its role chips without a round trip per card. Answers about the
            // caller and nobody else, so there is nothing here to authorize beyond being signed in.
            case 'my_event_grants':
                callback(await dataManager.getMyGrants(socket.data?.userId));
                break;
            case 'event_capabilities':
                callback(
                    request.eventId
                        ? await dataManager.getEventCapabilities(socket.data?.userId, request.eventId)
                        : null
                );
                break;
            case 'event_organizers':
                callback(request.eventId ? await dataManager.getEventOrganizers(request.eventId) : []);
                break;
            case 'sport_organizers':
                callback(
                    request.eventId && request.sportId
                        ? await sportOrganizersFor(socket.data?.userId, request.eventId, request.sportId)
                        : []
                );
                break;
            case 'division_organizers':
                callback(request.divisionId ? await divisionOrganizersFor(socket.data?.userId, request.divisionId) : []);
                break;
            // Display only — the list rows name who runs each division — so no `canWithdraw`:
            // withdrawing happens on the division's own screen, which reads `division_organizers`.
            case 'sport_division_organizers':
                callback(
                    request.eventId && request.sportId
                        ? await dataManager.getSportDivisionOrganizers(request.eventId, request.sportId)
                        : []
                );
                break;
            case 'organizer_candidates': {
                // Tier 1 is the host and the participating orgs; `global` is the explicit control
                // that widens it to everybody. Both projections are lean — a picker needs a name,
                // an organisation and a face, and nothing about appointing a convenor needs their
                // date of birth (`PEOPLE-1`).
                if (!request.eventId || !request.query) {
                    callback([]);
                    break;
                }
                const candidateOrgIds = request.global
                    ? undefined
                    : await dataManager.getEventOrgIds(request.eventId);
                callback(await dataManager.searchOrganizerCandidates(request.query, candidateOrgIds));
                break;
            }
            case 'system_settings':
                const sysSettingsRes = await pool.query('SELECT key, value FROM system_settings');
                const settingsObj: Record<string, any> = {};
                sysSettingsRes.rows.forEach(row => {
                    settingsObj[row.key] = row.value;
                });
                callback(settingsObj);
                break;
            default:
                console.error(`[get_data] ⚠️  UNHANDLED type: "${type}" — no case exists for this request. Full request:`, JSON.stringify(request));
                callback(null);
        }
        console.log(`Server: get_data completed. Type: ${type}`);
      } catch (error) {
        console.error(`Server: Error in get_data handler (${type}):`, error);
        callback(null);
      }
    });

  socket.on('join_room', async (incoming: unknown) => {
    // The payload is whatever the client sent, so it is `unknown` until checked. A non-string used
    // to reach `room.split(':')` and throw, and a throw in an async socket handler is an unhandled
    // rejection, which ends the process — from an anonymous socket (`SOCK-1`). `canJoinRoom` now
    // refuses a non-string on its own; the narrowing here is what lets the rest of this handler go
    // on treating `room` as the string it declares.
    if (typeof incoming !== 'string' || incoming.length === 0) {
      console.warn(`[Socket] Malformed join_room payload from ${socket.id}: ${JSON.stringify(incoming)}`);
      return;
    }
    const room = incoming;

    // Rooms are the read boundary: a broadcast carries its data, so whatever a
    // socket may join, it may read. Refuse before joining, never after.
    const joiningUserId = (socket as any).userId || 'anonymous';
    if (!(await canJoinRoom(joiningUserId, room))) {
      console.warn(`[Socket] Refused join: room=${room} user=${joiningUserId} socket=${socket.id}`);
      socket.emit('update', { topic: room, type: 'ROOM_ACCESS_DENIED', data: { room } });
      return;
    }
    socket.join(room);

    // A room hands over its own tier of state on join, and nothing beyond it.
    // This push IS the initial load - a client that joins does not also query.
    try {
        const parts = room.split(':');
        const kind = parts[0];
        const id = parts[1];
        const sub = parts[2];

        if (kind === 'org') {
            if (sub === 'members') {
                pushToSocket(socket, room, 'ORG_MEMBERS_SYNC', await dataManager.getOrganizationMembers(id));
            } else if (sub === 'teams') {
                pushToSocket(socket, room, 'TEAMS_SYNC', await dataManager.getTeams(id));
            } else if (sub === 'sites') {
                pushToSocket(socket, room, 'SITES_SYNC', await dataManager.getSites(id));
            } else if (sub === 'facilities') {
                pushToSocket(socket, room, 'FACILITIES_SYNC', await dataManager.getFacilitiesByOrg(id));
            } else if (sub === 'events') {
                // The `Event` records only. The game summaries under them are `org:{id}:fixtures`
                // (rule 4) - this room carried both until 2026-09-11, so an events list paid for
                // every game in the org on join.
                pushToSocket(socket, room, 'EVENTS_SYNC', await dataManager.getEvents(id));
            } else if (sub === 'summary') {
                const org = await dataManager.getOrganization(id);
                if (org) {
                    pushToSocket(socket, room, 'ORGANIZATION_UPDATED', org);
                } else {
                    pushToSocket(socket, room, 'ENTITY_NOT_FOUND', { id, type: 'organization' });
                }
            } else if (sub === 'referrals') {
                pushToSocket(socket, room, 'ORG_REFERRALS_SYNC', await dataManager.getReferralsForOrg(id));
            } else if (sub === 'fixtures') {
                // The other half of what `org:{id}:events` used to push (rule 4). A fixtures list
                // wants these and not the event records; the events list wants the reverse.
                pushToSocket(socket, room, 'GAME_SUMMARIES_SYNC', await dataManager.getGameSummaries(id));
            } else if (sub === 'leagues') {
                // `LIVE-14`: the room was joinable and published to (`LEAGUE_*`, `SEASON_*`) but
                // handed over nothing, so a leagues list started empty and only filled in if
                // somebody edited a league while it was open.
                pushToSocket(socket, room, 'LEAGUES_SYNC', await dataManager.getLeagues(id));
            }

        } else if (kind === 'team' && sub === 'members') {
            pushToSocket(socket, room, 'TEAM_MEMBERS_SYNC', await dataManager.getTeamMembers(id));

        } else if (kind === 'team') {
            const team = await dataManager.getTeam(id);
            if (team) pushToSocket(socket, room, 'TEAM_UPDATED', team);

        } else if (kind === 'event' && sub === 'entrants') {
            // The whole tournament's roster, as one push (U21). The entry screens work both axes
            // over this one dataset, so the join push *is* the load — there is no `get_data` here
            // and there should not be one.
            pushToSocket(socket, room, 'EVENT_ENTRANTS_SYNC', {
                eventId: id,
                entrants: await dataManager.getEventEntrants(id),
            });

        } else if (kind === 'event' && sub === 'fixtures') {
            pushToSocket(socket, room, 'GAME_SUMMARIES_SYNC', await dataManager.getGameSummariesByEvent(id));

        } else if (kind === 'event' && sub === 'divisions') {
            pushToSocket(socket, room, 'DIVISIONS_SYNC', await dataManager.getDivisions(id));

        } else if (kind === 'event' && sub === 'facilities') {
            pushToSocket(socket, room, 'EVENT_FACILITIES_SYNC', {
                eventId: id,
                facilityIds: await dataManager.getEventFacilities(id),
            });

        } else if (kind === 'event' && sub === 'standings') {
            const standingsEvent = await dataManager.getEvent(id);
            pushToSocket(socket, room, 'EVENT_STANDINGS_UPDATED', {
                eventId: id,
                rows: (standingsEvent as any)?.cachedStandings || [],
            });

        } else if (kind === 'event') {
            // The `Event` record only. Its fixtures, divisions, facilities and standings table are
            // four rooms of their own (rule 4); this one carried all five until 2026-09-11, so the
            // entrants screen - which wants the event and its divisions - ran three extra queries
            // per join for data it discards.
            const event = await dataManager.getEvent(id);
            if (event) pushToSocket(socket, room, 'EVENT_UPDATED', event);

        } else if (kind === 'division' && sub === 'stages') {
            pushToSocket(socket, room, 'STAGES_SYNC', {
                divisionId: id,
                stages: await dataManager.getStages(id),
            });

        } else if (kind === 'division' && sub === 'facilities') {
            pushToSocket(socket, room, 'DIVISION_FACILITIES_SYNC', {
                divisionId: id,
                facilityIds: await dataManager.getDivisionFacilities(id),
            });

        } else if (kind === 'division' && sub === 'entrants') {
            pushToSocket(socket, room, 'DIVISION_ENTRANTS_SYNC', {
                divisionId: id,
                entrants: await dataManager.getDivisionEntrants(id),
            });

        } else if (kind === 'division' && sub === 'adjustments') {
            pushToSocket(socket, room, 'DIVISION_ADJUSTMENTS_SYNC', {
                divisionId: id,
                adjustments: await dataManager.getDivisionAdjustments(id),
            });

        } else if (kind === 'division' && sub === 'stage_entrants') {
            // One message per stage, each a scoped snapshot keyed by `stageId`. Division-scoped
            // rather than `stage:{id}:entrants` because the screen reads every stage at once, which
            // is the scope clause of rule 4.
            for (const stage of await dataManager.getStages(id)) {
                pushToSocket(socket, room, 'STAGE_ENTRANTS_SYNC', {
                    stageId: stage.id,
                    entrants: await dataManager.getStageEntrants(stage.id),
                });
            }

        } else if (kind === 'division') {
            // Each room hands over its own tier and nothing beyond it — the `LIVE-4` rule applied
            // to a new set of entities. The fixtures and standings rooms are public, so neither
            // may push the roster or the adjustment reasons the base room carries.
            if (sub === 'fixtures') {
                // The fixtures. The division record, its stages and its venues each have a room
                // now (rule 4) - this one carried four datasets.
                pushToSocket(socket, room, 'DIVISION_GAMES_SYNC', await dataManager.getDivisionGames(id));
            } else if (sub === 'standings') {
                const standingsStages = await dataManager.getStages(id);
                pushToSocket(socket, room, 'DIVISION_STANDINGS_UPDATED', {
                    divisionId: id,
                    stages: standingsStages.map(stage => ({
                        stageId: stage.id,
                        name: stage.name,
                        status: stage.status,
                        rows: stage.cachedStandings || [],
                    })),
                });
            } else {
                // The division record. The roster, pool membership and adjustments that used to
                // share this room are `:entrants`, `:stage_entrants` and `:adjustments` (rule 4).
                const division = await dataManager.getDivision(id);
                if (division) pushToSocket(socket, room, 'DIVISION_UPDATED', division);
            }

        } else if (kind === 'league' && sub === 'seasons') {
            // `LIVE-14`, same shape as `org:{id}:leagues` above. Only the seasons: a league rename
            // is published to `org:{id}:leagues`, not here, so handing the league over from this
            // room would hand over something nothing republishes - the `FIX-4` trap.
            pushToSocket(socket, room, 'SEASONS_SYNC', await dataManager.getSeasons(id));

        } else if (kind === 'season' && sub === 'standings') {
            // `LIVE-14`. `STANDINGS_UPDATED` is exactly what this room republishes on every
            // recalculation, so the join push and the update are the same message.
            const season = await dataManager.getSeason(id);
            pushToSocket(socket, room, 'STANDINGS_UPDATED', season?.cachedStandings || []);

        } else if (kind === 'site') {
            const site = await dataManager.getSite(id);
            if (site) pushToSocket(socket, room, 'SITE_UPDATED', site);

        } else if (kind === 'facility') {
            const facility = await dataManager.getFacility(id);
            if (facility) pushToSocket(socket, room, 'FACILITY_UPDATED', facility);

        } else if (kind === 'game') {
            if (sub === 'summary') {
                // Spectator tier: score, clock, status, teams. No event feed.
                const summary = await dataManager.getGameSummary(id);
                if (summary) pushToSocket(socket, room, 'GAME_SUMMARY_UPDATED', summary);
            } else if (sub === 'disputes') {
                // Open disputes only. Split out of `:events`, which carried the scoring feed too.
                pushToSocket(socket, room, 'ACTIVE_DISPUTES_SYNC', await gameEventManager.getActiveDisputes(id));
            } else if (sub === 'events') {
                // The scoring feed only; open disputes are `game:{id}:disputes` (rule 4).
                pushToSocket(socket, room, 'GAME_EVENTS_SYNC', await dataManager.getGameEvents(id));
            } else {
                // The full game record.
                const game = await dataManager.getGame(id);
                if (game) pushToSocket(socket, room, 'GAME_UPDATED', game);
            }

        } else if (kind === 'user' && sub === 'memberships') {
            // Joining is the load, so the root layout need not query for this at all (rule 2). Same
            // `{ orgs, teams }` shape the `user_memberships` query and the broadcast both use.
            pushToSocket(socket, room, 'USER_MEMBERSHIPS_UPDATED', {
                orgs: await userManager.getUserOrgMemberships(id),
                teams: await userManager.getUserTeamMemberships(id),
            });

        } else if (kind === 'user' && sub === 'capabilities') {
            // What this user may do, across every event they hold a grant on. Its own room rather
            // than a field on the event, because a room broadcast reaches everyone in it and this
            // is one person's rights (Phase 4). The join push is the load, so `useMyEventGrants`
            // issues no query.
            pushToSocket(socket, room, 'EVENT_GRANTS_SYNC', await dataManager.getMyGrants(id));

        } else if (kind === 'user' && sub === 'notifications') {
            pushToSocket(socket, room, 'NOTIFICATIONS_SYNC', await dataManager.getNotifications(id));
        }
    } catch (error) {
        console.error(`Error pushing data for room ${room}:`, error);
    }
  });

  socket.on('leave_room', (room: unknown) => {
    // Same reasoning as `join_room`: the payload is unchecked until it is checked. Leaving is not
    // an access decision, so a bad one is simply ignored rather than reported.
    if (typeof room !== 'string' || room.length === 0) return;
    socket.leave(room);
  });

  socket.on('subscribe', async (channel) => {
        try {
            if (channel === 'games') {
                // No longer pushing all games on subscribe. 
                // Client must request via 'get_live_games' or 'join_room' for specific game updates.
            }
        } catch (error) {
             console.error(`Error pushing data for channel ${channel}:`, error);
        }
    });

  socket.on('unsubscribe', (topic: unknown) => {
    if (typeof topic !== 'string' || topic.length === 0) return;
    console.log(`Socket ${socket.id} unsubscribed from ${topic}`);
    socket.leave(topic);
  });

  const runAction = async (action: { type: SocketAction, payload: any }, callback: ((ack: ActionAck) => void) | undefined) => {
    // Same class of defect as `SOCK-1`, at the other unchecked boundary: this preamble reads
    // `action.type` *before* the try block below, so an emit with no payload — or a non-object one —
    // threw here and ended the process. The declared parameter type is a claim about a value that
    // arrived over the network, not a guarantee about it.
    if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string') {
      console.warn(`[Socket] Malformed action payload from ${socket.id}: ${JSON.stringify(action)}`);
      if (callback) callback({ status: 'error', message: 'Malformed action' } satisfies ActionAck);
      return;
    }

    console.log(`[Socket] Action received: ${action.type} from ${socket.id}`, action.payload);
    console.log(`[Socket] Entering switch for action type: "${action.type}"`);
    
    let result: any = null;
    let updateTopic = '';
    let updateType = '';
    
    // Some actions might need multiple broadcasts (e.g. to team room AND global list)
    let additionalBroadcasts: { topic: string, type: string, data: any }[] = [];

    const broadcastOrgSummaries = async (orgIds: (string | undefined)[]) => {
        const uniqueOrgIds = [...new Set(orgIds.filter((id): id is string => !!id))];
        console.log(`Server: Requesting summary broadcast for orgs: ${uniqueOrgIds.join(', ')}`);
        for (const orgId of uniqueOrgIds) {
            const updatedOrg = await dataManager.getOrgSummary(orgId);
            if (updatedOrg) {
                // Emit to the specific organization summary room (for dashboards)
                const room = `org:${orgId}:summary`;
                broadcast(room, 'ORGANIZATION_UPDATED', updatedOrg);
                console.log(`Server: Broadcasted ORGANIZATION_UPDATED for ${orgId} to ${room}`);
            } else {
                console.warn(`Server: Could not find organization ${orgId} for summary broadcast`);
            }
        }
    };

    // The handshake is the only trustworthy source of identity on this socket.
    const socketUserId: string = (socket as any).userId;
    const authUserId: string | null =
      socketUserId && socketUserId !== 'anonymous' && socketUserId !== 'invalid-token'
        ? socketUserId
        : null;

    try {
        /*
         * Every authorisation decision, in order, and nowhere else (2026-09-21).
         *
         * No handler below checks who is asking: if an action reaches the switch, a gate has let it
         * through. `org-permissions` asserts that for every action the switch handles. Each gate runs
         * inside `gate()`, so a refusal is logged once, naming the gate and — where the gate records
         * one — the rule that refused, before the client is told. "Why was this refused?" is then a
         * single line in the log rather than a read through the handler.
         */
        const gate = async (name: string, check: () => Promise<void>) => {
            try {
                await check();
            } catch (err: any) {
                const rule = err instanceof GateRefusal ? ` rule=${err.rule}` : '';
                console.warn(
                    `[Gate] ${name} refused ${action.type} for ${authUserId || 'anonymous'}${rule}: ${err?.message}`
                );
                throw err;
            }
        };

        // Live match mutations — the scorer of the fixture.
        await gate('scoring', async () => {
            const scoringGameIdFor = SCORING_ACTION_GAME_ID[action.type];
            if (!scoringGameIdFor) return;
            if (!authUserId) {
                throw new Error('Unauthorized: You must be signed in to score this match.');
            }
            const targetGameId = scoringGameIdFor(action.payload);
            if (!targetGameId) {
                throw new Error(`Bad request: ${action.type} requires a game id.`);
            }
            if (!(await dataManager.canScoreGame(authUserId, targetGameId))) {
                throw new Error('Unauthorized: You do not have permission to score this match.');
            }
        });

        // Tournament structure — event scope first, then the division a convenor holds.
        await gate('tournament', () => enforceTournamentAction(authUserId, action.type, action.payload));

        // Person records, which are identity (`PEOPLE-2`).
        await gate('profile', () => enforceProfileAction(authUserId, action.type, action.payload));

        // An organisation's things, events and fixtures, and the actions that were open to anybody
        // until 2026-09-21. May cut the payload down, for an outsider creating in an unclaimed org.
        await gate('organisation', () => enforceOrgAction(authUserId, action.type, action.payload));

        // A caller may only act as one of its own org profiles.
        await gate('identity', async () => {
            if (!authUserId) return;
            for (const field of CALLER_PROFILE_FIELDS) {
                const claimedProfileId = action.payload?.[field];
                if (!claimedProfileId) continue;
                if (!(await dataManager.ownsOrgProfile(authUserId, claimedProfileId))) {
                    // Which profile was claimed goes to the log in `rule`, never to the client.
                    throw new GateRefusal(
                        'Unauthorized: That profile does not belong to your account.',
                        `acts-as ${field}=${claimedProfileId}`
                    );
                }
            }
        });

        switch(action.type) {
            case SocketAction.DELETE_ORG:
                // `deleteOrganization` throws when the org still has dependants and returns nothing
                // otherwise, so the id is the result (an empty result is refused below).
                await dataManager.deleteOrganization(action.payload.id);
                result = { id: action.payload.id };
                // Broadcast to room that the org is gone
                broadcast(`org:${action.payload.id}:summary`, 'ORGANIZATION_UPDATED', { id: action.payload.id, deleted: true });
                break;

            case SocketAction.ADD_AGE_GROUP: {
                // Anyone who can give a team, division or league an age group can need one the
                // official list lacks, so being signed in is the whole gate. Nothing broadcasts:
                // the entry is returned to the picker that asked, and other screens see it the
                // next time they load the sports list.
                // Signed-in is checked in `orgGate`; that the sport exists is validation, and stays here.
                const { sportId, name, orgId: addedFromOrgId } = action.payload || {};
                if (!sportId || !(await sportManager.getSport(sportId))) throw new Error('Choose a sport first.');
                // Non-null because `orgGate` refused a signed-out caller before this ran — and the
                // coverage check in `org-permissions` fails if this action ever loses its rule.
                result = await ageGroupManager.addCustom(sportId, name, authUserId!, addedFromOrgId);
                break;
            }

            case SocketAction.ADD_LEAGUE:
                result = await dataManager.createLeague(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:leagues`, type: 'LEAGUE_ADDED', data: result });
                }
                break;
            case SocketAction.UPDATE_LEAGUE:
                result = await dataManager.updateLeague(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:leagues`, type: 'LEAGUE_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_LEAGUE:
                const leagueToDelete = await dataManager.getLeague(action.payload.id);
                result = await dataManager.deleteLeague(action.payload.id);
                if (result && leagueToDelete) {
                    additionalBroadcasts.push({ topic: `org:${leagueToDelete.orgId}:leagues`, type: 'LEAGUE_DELETED', data: { id: action.payload.id } });
                }
                break;
            case SocketAction.ADD_SEASON:
                result = await dataManager.createSeason(action.payload);
                if (result) {
                    const parentLeague = await dataManager.getLeague(result.leagueId);
                    if (parentLeague) {
                        additionalBroadcasts.push({ topic: `org:${parentLeague.orgId}:leagues`, type: 'SEASON_ADDED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `league:${result.leagueId}:seasons`, type: 'SEASON_ADDED', data: result });
                }
                break;
            case SocketAction.UPDATE_SEASON:
                result = await dataManager.updateSeason(action.payload.id, action.payload.data);
                if (result) {
                    const parentLeague = await dataManager.getLeague(result.leagueId);
                    if (parentLeague) {
                        additionalBroadcasts.push({ topic: `org:${parentLeague.orgId}:leagues`, type: 'SEASON_UPDATED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `league:${result.leagueId}:seasons`, type: 'SEASON_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `season:${result.id}:standings`, type: 'STANDINGS_UPDATED', data: result.cachedStandings });
                }
                break;
            case SocketAction.DELETE_SEASON:
                const seasonToDelete = await dataManager.getSeason(action.payload.id);
                result = await dataManager.deleteSeason(action.payload.id);
                if (result && seasonToDelete) {
                    const parentLeague = await dataManager.getLeague(seasonToDelete.leagueId);
                    if (parentLeague) {
                        additionalBroadcasts.push({ topic: `org:${parentLeague.orgId}:leagues`, type: 'SEASON_DELETED', data: { id: action.payload.id } });
                    }
                    additionalBroadcasts.push({ topic: `league:${seasonToDelete.leagueId}:seasons`, type: 'SEASON_DELETED', data: { id: action.payload.id } });
                }
                break;
            case SocketAction.ADD_SEASON_TEAM:
                result = await dataManager.addTeamToSeason(action.payload.seasonId, action.payload.teamId, action.payload.status);
                if (result) {
                    const updatedSeason = await dataManager.getSeason(action.payload.seasonId);
                    if (updatedSeason) {
                        additionalBroadcasts.push({ topic: `season:${action.payload.seasonId}:standings`, type: 'STANDINGS_UPDATED', data: updatedSeason.cachedStandings });
                    }
                }
                break;
            case SocketAction.REMOVE_SEASON_TEAM:
                result = await dataManager.removeTeamFromSeason(action.payload.seasonId, action.payload.teamId);
                if (result) {
                    const updatedSeason = await dataManager.getSeason(action.payload.seasonId);
                    if (updatedSeason) {
                        additionalBroadcasts.push({ topic: `season:${action.payload.seasonId}:standings`, type: 'STANDINGS_UPDATED', data: updatedSeason.cachedStandings });
                    }
                }
                break;
            case SocketAction.ADD_GAME_TO_SEASON:
                result = await dataManager.addGameToSeason(action.payload.gameId, action.payload.seasonId);
                if (result) {
                    const updatedSeason = await dataManager.getSeason(action.payload.seasonId);
                    if (updatedSeason) {
                        additionalBroadcasts.push({ topic: `season:${action.payload.seasonId}:standings`, type: 'STANDINGS_UPDATED', data: updatedSeason.cachedStandings });
                    }
                }
                break;
            case SocketAction.REMOVE_GAME_FROM_SEASON:
                result = await dataManager.removeGameFromSeason(action.payload.gameId, action.payload.seasonId);
                if (result) {
                    const updatedSeason = await dataManager.getSeason(action.payload.seasonId);
                    if (updatedSeason) {
                        additionalBroadcasts.push({ topic: `season:${action.payload.seasonId}:standings`, type: 'STANDINGS_UPDATED', data: updatedSeason.cachedStandings });
                    }
                }
                break;

            case SocketAction.ADD_TEAM:
                result = await dataManager.addTeam(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.UPDATE_TEAM:
                result = await dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.DELETE_TEAM:
                const teamToDelete = await dataManager.getTeam(action.payload.id);
                result = await dataManager.deleteTeam(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                    if (teamToDelete) await broadcastOrgSummaries([teamToDelete.orgId]);
                }
                break;

            case SocketAction.REFER_ORG_CONTACT:
                const { orgId, contactEmails, referredByUserId } = action.payload;
                result = await dataManager.referOrgContact(orgId, contactEmails, referredByUserId);
                if (Array.isArray(result)) {
                    result.forEach(ref => {
                        additionalBroadcasts.push({ 
                            topic: `org:${orgId}:referrals`, 
                            type: 'ORG_REFERRAL_ADDED', 
                            data: ref 
                        });
                    });
                }
                break;

            case SocketAction.ADD_SITE:
                result = await dataManager.addSite(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.UPDATE_SITE:
                result = await dataManager.updateSite(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_UPDATED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.DELETE_SITE:
                result = await dataManager.deleteSite(action.payload.id);
                if (result) {
                     additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_DELETED', data: { id: result.id } });
                     additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_DELETED', data: { id: result.id } });
                     await broadcastOrgSummaries([result.orgId]);
                }
                break;

            case SocketAction.ADD_FACILITY:
                result = await dataManager.addFacility(action.payload);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_ADDED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_ADDED', data: result });
                }
                break;
            case SocketAction.UPDATE_FACILITY:
                result = await dataManager.updateFacility(action.payload.id, action.payload.data);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_UPDATED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_FACILITY:
                result = await dataManager.deleteFacility(action.payload.id);
                if (result) {
                     const parentSite = await dataManager.getSite(result.siteId);
                     if (parentSite) {
                         additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_DELETED', data: { id: result.id } });
                     }
                      additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_DELETED', data: { id: result.id } });
                }
                break;

            case SocketAction.ADD_GAME:
                result = await dataManager.addGame(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: eventFixturesRoom(result.eventId), type: 'GAME_ADDED', data: result });
                    await publishGameSummary(result.id);
                    // A hand-added fixture now names its stage (`FIX-12`), which means it is part
                    // of that stage's completeness: a stage that had read `Complete` has an
                    // unplayed fixture in it again. The choke point is what knows that, and going
                    // through it here is the same rule as everywhere else — one function rewrites
                    // a table, and every path that changes what it counts calls it.
                    if (result.stageId) await dataManager.recalculateStandingsForGame(result.id);
                }
                break;
            case SocketAction.UPDATE_GAME_STATUS:
                result = await dataManager.updateGameStatus(action.payload.id, action.payload.status);
                if (result) {
                    // Published now rather than queued: the log entry below can still fail, and
                    // the status change has happened whether or not it does.
                    broadcast(`game:${result.id}`, 'GAME_UPDATED', result);
                    broadcast(eventFixturesRoom(result.eventId), 'GAME_UPDATED', result);
                    await publishGameSummary(result.id);
                    await recordChangeInLog(action.payload, 'STATUS');
                }
                break;
            case SocketAction.RECORD_GAME_RESULT: {
                // Authorised in the scoring gate. A result, or a result recorded as not provided,
                // finishes the match in the same write — see `EventManager.recordGameResult`.
                const recordFor = await dataManager.getGame(action.payload.id);
                if (!recordFor) throw new Error('That match no longer exists.');
                validateRecordedResult(recordFor, action.payload);
                const notProvided = !!action.payload.notProvided;
                result = await dataManager.recordGameResult(
                    action.payload.id,
                    notProvided ? { notProvided: true } : { scores: action.payload.scores }
                );
                if (result) {
                    broadcast(`game:${result.id}`, 'GAME_UPDATED', result);
                    broadcast(eventFixturesRoom(result.eventId), 'GAME_UPDATED', result);
                    await publishGameSummary(result.id);
                    // Logged, which finishing a match from the edit form never was.
                    await recordChangeInLog(
                        {
                            id: action.payload.id,
                            log: {
                                subType: 'RESULT_RECORDED',
                                eventData: notProvided ? { notProvided: true } : { scores: action.payload.scores },
                            },
                            initiatorOrgProfileId: action.payload.initiatorOrgProfileId,
                        },
                        'STATUS'
                    );
                }
                break;
            }
            case SocketAction.UPDATE_GAME_CLOCK:
                result = await dataManager.updateGameClock(action.payload.id, action.payload.action);
                if (result) {
                    // The whole game, exactly as `UPDATE_GAME_STATUS` above publishes it (`LIVE-16`).
                    // This used to send a hand-built `{ id, eventId, status, startTime, liveState }`
                    // delta under the same `GAME_UPDATED` type name that elsewhere carries a full
                    // `Game` - so a receiver could not tell the two apart, and the client had to
                    // shallow-merge every `GAME_UPDATED` with a special case for `liveState`. That
                    // made this the only non-idempotent merge in the system, and so the only reason
                    // the client needed a replay log rather than stored state. A clock action is a
                    // button press, not a tick: the clock runs locally off `lastStartedAt` (see
                    // `useGameTimer`), so this fires a handful of times per match and the few extra
                    // KB buys consistency cheaply. The compact tier is `publishGameSummary` below,
                    // which is what every fixture list reads.
                    // Published now, not queued, for the reason given under UPDATE_GAME_STATUS.
                    broadcast(`game:${result.id}`, 'GAME_UPDATED', result);
                    await publishGameSummary(result.id);
                    await recordChangeInLog(action.payload, 'TIME');
                }
                break;
            case SocketAction.ADD_GAME_EVENT:
                result = await recordGameEvent(action.payload);
                break;
            case SocketAction.UPDATE_GAME_EVENT:
                const updatedEvent = await gameEventManager.updateEvent(action.payload.gameId, action.payload.eventId, { 
                    eventData: action.payload.eventData,
                    actorOrgProfileId: action.payload.actorOrgProfileId,
                    gameParticipantId: action.payload.gameParticipantId
                });
                if (!('error' in updatedEvent)) {
                    broadcast(`game:${action.payload.gameId}`, 'GAME_EVENT_UPDATED', updatedEvent);
                    result = updatedEvent;
                } else {
                    console.error('Server: Failed to update game event:', updatedEvent.error);
                    throw new Error(updatedEvent.error);
                }
                break;
            case SocketAction.INITIATE_UNDO_VOTE:
                const undoVoteRes = await gameEventManager.initiateUndoVote(action.payload.gameId, action.payload.eventIdToUndo, action.payload.initiatorId);
                if (undoVoteRes.success) {
                    console.log(`Server: Broadcasting DISPUTE_STARTED (UNDO) for game ${action.payload.gameId}, dispute: ${undoVoteRes.dispute?.id}`);
                    broadcast(gameDisputesRoom(action.payload.gameId), 'DISPUTE_STARTED', { eventId: action.payload.eventIdToUndo, gameId: action.payload.gameId, dispute: undoVoteRes.dispute });
                    result = undoVoteRes.dispute;
                } else {
                    throw new Error(undoVoteRes.error || 'The undo vote could not be started.');
                }
                break;
            case SocketAction.INITIATE_UPDATE_VOTE:
                const updateVoteRes = await gameEventManager.initiateUpdateVote(action.payload.gameId, action.payload.eventId, action.payload.initiatorId, action.payload.updateData);
                if (updateVoteRes.success) {
                    console.log(`Server: Broadcasting DISPUTE_STARTED (UPDATE) for game ${action.payload.gameId}, dispute: ${updateVoteRes.dispute?.id}`);
                    broadcast(gameDisputesRoom(action.payload.gameId), 'DISPUTE_STARTED', { eventId: action.payload.eventId, gameId: action.payload.gameId, dispute: updateVoteRes.dispute });
                    result = updateVoteRes.dispute;
                } else {
                    throw new Error(updateVoteRes.error || 'The update vote could not be started.');
                }
                break;
            case SocketAction.CAST_UNDO_VOTE:
            case SocketAction.CAST_UPDATE_VOTE:
                const castRes = await gameEventManager.castUpdateVote(action.payload.gameId, action.payload.disputeId, action.payload.officialId, action.payload.vote);
                if (!castRes.success) throw new Error(castRes.error || 'That vote could not be recorded.');
                broadcast(gameDisputesRoom(action.payload.gameId), 'DISPUTE_VOTE_UPDATED', { dispute: castRes.dispute });
                result = { dispute: castRes.dispute, resolved: !!castRes.resolved };
                break;
            case SocketAction.UPDATE_GAME: {
                // Authorised in `orgGate` (`edit-fixture`). Planning only since 2026-09-21: the
                // result and the match's progress are the scoring actions' — see `fixtureRules.ts`.
                {
                    const current = await dataManager.getGame(action.payload.id);
                    if (!current) throw new Error('That match no longer exists.');
                    refuseResultInFixtureEdit(action.payload.data, current);
                }
                result = await dataManager.updateGame(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: eventFixturesRoom(result.eventId), type: 'GAME_UPDATED', data: result });
                    await publishGameSummary(result.id);
                }
                break;
            }
            case SocketAction.UPDATE_GAME_SCORE:
                const gameToUpdate = await dataManager.getGame(action.payload.id);
                if (gameToUpdate) {
                    const updatedLiveState = { ...(gameToUpdate.liveState || {}), scores: action.payload.scores };
                    result = await dataManager.updateGame(action.payload.id, { liveState: updatedLiveState });
                    if (result) {
                        const scoreDelta = { id: result.id, eventId: result.eventId, liveState: { scores: action.payload.scores } };
                        broadcast(`game:${result.id}`, 'GAME_UPDATED', scoreDelta);
                        await publishGameSummary(result.id);
                    }
                }
                break;
            case SocketAction.REMOVE_SIN_BIN:
                const removed = await gameEventManager.removeSinBin(action.payload.gameId, action.payload.sinBinId);
                if (!removed) throw new Error('That sin bin has already ended or been removed.');
                const updatedGame = await dataManager.getGame(action.payload.gameId);
                if (updatedGame) {
                    broadcast(`game:${action.payload.gameId}`, 'GAME_UPDATED', updatedGame);
                    await publishGameSummary(action.payload.gameId);
                }
                result = { gameId: action.payload.gameId, sinBinId: action.payload.sinBinId };
                break;
            case SocketAction.RESET_GAME:
                await dataManager.resetGame(action.payload.id);
                // Also clear all game events (redundant if EventManager does it, but safe)
                await pool.query('DELETE FROM game_events WHERE game_id = $1', [action.payload.id]);
                result = await dataManager.getGame(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_RESET', data: result });
                    additionalBroadcasts.push({ topic: `game:${result.id}:events`, type: 'GAME_RESET', data: { gameId: result.id } });
                    additionalBroadcasts.push({ topic: `game:${result.id}:events`, type: 'GAME_EVENTS_SYNC', data: [] });
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: eventFixturesRoom(result.eventId), type: 'GAME_UPDATED', data: result });
                    await publishGameSummary(result.id);
                }
                break;

            case SocketAction.SAVE_GAME_ROSTER:
                const { gameId, participantId, items } = action.payload;
                result = await dataManager.saveGameRoster(gameId, participantId, items);
                if (result) {
                    // Broadcast roster update to the game room
                    broadcast(`game:${gameId}`, 'GAME_ROSTER_UPDATED', { gameId, participantId, items });
                    additionalBroadcasts.push({ topic: `game:${gameId}`, type: 'GAME_UPDATED', data: await dataManager.getGame(gameId) });
                }
                break;
            case SocketAction.DELETE_GAME: {
                // Authorised in `orgGate` (`edit-fixture`), before this handler runs.
                // The audience has to be captured before the row goes, or there is
                // nothing left to resolve the participating orgs from.
                const deletedGameRooms = await captureFixtureRooms(action.payload.id);
                result = await dataManager.deleteGame(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: eventFixturesRoom(result.eventId), type: 'GAME_DELETED', data: { id: result.id } });
                    publishGameRemoved(result.id, deletedGameRooms);
                }
                break;
            }
            case SocketAction.UNDO_GAME_EVENT:
                // A refusal is thrown, not returned as `{ success: false }` inside an ok: the client
                // reads `status`, and an ok that means "refused" is a silent failure (SYNC-1).
                if (!action.payload.initiatorId) {
                    throw new Error('initiatorId is required for UNDO_GAME_EVENT action.');
                }
                const undoRes = await gameEventManager.undoEvent(action.payload.gameId, action.payload.eventId, action.payload.initiatorId);
                if (!undoRes.success) throw new Error(undoRes.error || 'That event could not be undone.');
                result = { success: true };
                break;
            case SocketAction.GET_SYSTEM_SETTINGS:
                const sysSettingsRes = await pool.query('SELECT key, value FROM system_settings');
                const settings: Record<string, any> = {};
                sysSettingsRes.rows.forEach(row => {
                    settings[row.key] = row.value;
                });
                result = settings;
                break;

            case SocketAction.ADD_EVENT:
                result = await dataManager.addEvent(action.payload);
                if (result) {
                    console.log("Server: Event Added, processing broadcasts. Participating:", result.participatingOrgIds);
                    // A tournament is created with its first division already in it (U16), and that
                    // division with its stages (D11) — silently, and here rather than in the wizard,
                    // so the invariant holds for every caller rather than for the one screen that
                    // remembered. The organiser never meets either concept: one division collapses
                    // into the event screen and one stage shows no tabs (U15).
                    if (result.type === 'Tournament') {
                        // One division per sport chosen (U52); none until a sport is.
                        await createSportDivisions(result, result.sportIds || []);
                    }
                    publishEventToOrgs([result.orgId, ...(result.participatingOrgIds || [])], 'EVENT_ADDED', result);
                    additionalBroadcasts.push({ topic: eventRoom(result.id), type: 'EVENT_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId, ...(result.participatingOrgIds || [])]);
                }
                break;
            case SocketAction.UPDATE_EVENT:
                // Authorised in `orgGate` (`edit-event`), before this handler runs.
                // Fetch current event to know who might be removed
                const oldEvent = await dataManager.getEvent(action.payload.id);
                // U52: a tournament's sports and divisions move together. A sport a division plays
                // cannot be removed — refused before anything is written — and a sport added gets a
                // division once the write has landed.
                const sportsChanging =
                    oldEvent?.type === 'Tournament' && Array.isArray(action.payload.data?.sportIds);
                const previousSportIds = oldEvent?.sportIds || [];
                if (sportsChanging) {
                    await assertSportsRemovable(action.payload.id, previousSportIds, action.payload.data.sportIds);
                }
                result = await dataManager.updateEvent(action.payload.id, action.payload.data);
                if (result && sportsChanging) {
                    await createSportDivisions(
                        result,
                        (result.sportIds || []).filter((id: string) => !previousSportIds.includes(id))
                    );
                }
                if (result) {
                    const oldOrgIds = oldEvent ? [oldEvent.orgId, ...(oldEvent.participatingOrgIds || [])] : [];
                    const newOrgIds = [result.orgId, ...(result.participatingOrgIds || [])];
                    const allAffectedOrgs = [...new Set([...oldOrgIds, ...newOrgIds])];

                    publishEventToOrgs(newOrgIds, 'EVENT_UPDATED', result);
                    additionalBroadcasts.push({ topic: eventRoom(result.id), type: 'EVENT_UPDATED', data: result });

                    // Also notify removed orgs that the event is gone for them
                    publishEventToOrgs(oldOrgIds.filter(id => !newOrgIds.includes(id)), 'EVENT_DELETED', { id: result.id });

                    await broadcastOrgSummaries(allAffectedOrgs);

                    // `FIX-14`. The three settings keys below are what every division without a
                    // system of its own is scored by, so changing one changes every table under
                    // the event — and a cached table nobody rebuilt is a table that is simply
                    // wrong. `UPDATE_DIVISION` has always done this for a division's own
                    // overrides; this is the event-level twin of it.
                    //
                    // No cost dialog (U31): that exists because regenerating fixtures *destroys*
                    // results. Nothing is destroyed here — the tables are derived, and rebuilding
                    // them from the same fixtures is what makes them agree with the points the
                    // organiser just set.
                    const scoringKeys = ['scoring', 'tiebreakers', 'scoringSubject'];
                    const scoringSettingsChanged =
                        action.payload.data?.settings !== undefined &&
                        scoringKeys.some(key =>
                            JSON.stringify((oldEvent as any)?.settings?.[key] ?? null) !==
                            JSON.stringify((result as any)?.settings?.[key] ?? null)
                        );
                    if (scoringSettingsChanged) {
                        const recalculatedDivisionIds = await tournamentManager.recalculateEvent(result.id);
                        for (const divisionId of recalculatedDivisionIds) {
                            await publishStandings(divisionId, null);
                        }
                        if (recalculatedDivisionIds.length) await publishStandings(null, result.id);
                    }
                }
                break;
            case SocketAction.DELETE_EVENT:
                // Authorised in `orgGate` (`edit-event`), before this handler runs.
                result = await dataManager.deleteEvent(action.payload.id);
                if (result) {
                    publishEventToOrgs([result.orgId, ...(result.participatingOrgIds || [])], 'EVENT_DELETED', { id: result.id });
                    await broadcastOrgSummaries([result.orgId, ...(result.participatingOrgIds || [])]);
                }
                break;

            case SocketAction.ADD_ORG:
                result = await dataManager.addOrganization(action.payload);
                if (result) {
                    if (action.payload.creatorId) {
                        await publishUserMemberships(action.payload.creatorId);
                    }
                    await broadcastOrgSummaries([result.id]);
                }
                break;
            case SocketAction.UPDATE_ORG:
                result = await dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    await broadcastOrgSummaries([result.id]);
                }
                break;

            case SocketAction.ADD_TEAM_MEMBER:
                result = await dataManager.addTeamMember(action.payload);
                // The whole roster, not the bare membership row. `addTeamMember` returns a
                // `TeamMembership` - ids and dates - while a roster row is a `TeamMember`, joined
                // to `org_profiles` for the name, image and contact details the screen renders.
                // Publishing the narrow shape is what left the client re-reading `team_members` on
                // every change, which is the nudge live-data rule 1 exists to remove.
                // Published through `additionalBroadcasts` rather than `updateTopic`, because
                // `result` must stay the membership row for the org-count logic below — and the
                // generic publisher sends `result`, which is the wrong shape for this type.
                additionalBroadcasts.push({
                    topic: teamMembersRoom(result.teamId),
                    type: 'TEAM_MEMBERS_SYNC',
                    data: await dataManager.getTeamMembers(result.teamId),
                });
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = await dataManager.getTeam(result.teamId);
                if (teamForAdd) {
                     additionalBroadcasts.push({ 
                         topic: `org:${teamForAdd.orgId}:teams`, 
                         type: 'TEAM_UPDATED', 
                         data: { ...teamForAdd } 
                     });
                     // Broadcast ORG_MEMBER_UPDATED to notify the People & Roles list of the new member
                     const orgMemberForAdd = (await dataManager.getOrganizationMembers(teamForAdd.orgId)).find((m: any) => m.id === result.orgProfileId);
                     additionalBroadcasts.push({
                         topic: `org:${teamForAdd.orgId}:members`,
                         type: 'ORG_MEMBER_UPDATED',
                         data: orgMemberForAdd || {}
                     });
                }

                const richMemberAdd = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                if (richMemberAdd) {
                    result = richMemberAdd;
                    
                    // Refresh memberships for the affected user
                    if (richMemberAdd.userId) {
                        await publishUserMemberships(richMemberAdd.userId);
                    }
                }
                if (teamForAdd) {
                    await broadcastOrgSummaries([teamForAdd.orgId]);
                }
                break;
            case SocketAction.UPDATE_TEAM_MEMBER:
                result = await dataManager.updateTeamMember(action.payload.id, action.payload.data);
                if (result) {
                    // Same reasoning as `ADD_TEAM_MEMBER`: the roster is the dataset this room
                    // carries, so the whole roster is what it publishes.
                    updateTopic = teamMembersRoom(result.teamId);
                    updateType = 'TEAM_MEMBERS_SYNC';
                    result = await dataManager.getTeamMembers(result.teamId);
                }
                break;
            case SocketAction.REMOVE_TEAM_MEMBER:
                result = await dataManager.removeTeamMember(action.payload.id); 
                if (result) {
                    // As in `ADD_TEAM_MEMBER`: the roster goes out here so `result` can stay the
                    // membership row the org-count logic below reads.
                    additionalBroadcasts.push({
                        topic: teamMembersRoom(result.teamId),
                        type: 'TEAM_MEMBERS_SYNC',
                        data: await dataManager.getTeamMembers(result.teamId),
                    });

                    // ALSO Broadcast to the Org Team List (to update counts)
                    const teamForRem = await dataManager.getTeam(result.teamId);
                    if (teamForRem) {
                         additionalBroadcasts.push({ 
                             topic: `org:${teamForRem.orgId}:teams`, 
                             type: 'TEAM_UPDATED', 
                             data: { ...teamForRem } 
                         });
                         await broadcastOrgSummaries([teamForRem.orgId]);
                    }
                }
                break;
            case SocketAction.ADD_ORG_MEMBER:
                if (action.payload.orgId !== 'org-system-admins') {
                    const isAdminAccount = await pool.query(
                        `SELECT 1 FROM org_profiles WHERE id = $1 AND (org_id = 'org-system-admins' OR user_id IN (SELECT op2.user_id FROM org_profiles op2 WHERE op2.org_id = 'org-system-admins'))`,
                        [action.payload.orgProfileId]
                    );
                    if (isAdminAccount.rows.length > 0) {
                        throw new Error('System Admin accounts cannot be added to standard user organizations. Please use a standard user account.');
                    }
                }
                console.log(`DataManager: Adding org member ${action.payload.orgProfileId} to ${action.payload.orgId}`);
                result = await dataManager.addOrganizationMember(action.payload.orgProfileId, action.payload.orgId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = (await dataManager.getOrganizationMembers(action.payload.orgId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                        
                        // Broadcast to user room if linked to an account
                        if (richMember.userId) {
                            await publishUserMemberships(richMember.userId);
                            
                            // Send notification
                            const org = await dataManager.getOrganization(action.payload.orgId);
                            const role = await dataManager.getOrganizationRole(action.payload.roleId);
                            if (org && role) {
                                const notification = await dataManager.createNotification(
                                    richMember.userId,
                                    'New Organization Added',
                                    `You have been added to ${org.name} as a ${role.name}.`,
                                    'org_added',
                                    `/admin/organizations/${org.id}`
                                );
                                if (notification) {
                                    broadcast(userNotificationsRoom(richMember.userId), 'NOTIFICATION_ADDED', notification);
                                }
                            }
                        }
                    }
                    
                    updateTopic = `org:${action.payload.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([action.payload.orgId]);
                }
                break;
            case SocketAction.UPDATE_ORG_MEMBER:
                console.log(`DataManager: Updating org member role ${action.payload.id} to ${action.payload.roleId}`);
                result = await dataManager.updateOrganizationMember(action.payload.id, action.payload.roleId);
                if (result) {
                    updateTopic = `org:${result.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = (await dataManager.getOrganizationMembers(result.orgId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
            case SocketAction.REMOVE_ORG_MEMBER:
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                const orgMembershipToRem = await dataManager.getOrgMembership(action.payload.id);
                result = await dataManager.removeOrganizationMember(action.payload.id);
                if (orgMembershipToRem) {
                    // Refresh memberships for the affected user
                    const profile = await dataManager.getOrgProfile(orgMembershipToRem.orgProfileId);
                    if (profile && profile.userId) {
                        await publishUserMemberships(profile.userId);
                    }

                    updateTopic = `org:${orgMembershipToRem.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([orgMembershipToRem.orgId]);
                }
                break;
            case SocketAction.SEND_MEMBER_INVITE: {
                // Invites a person the org has on record to create an account. There is no token:
                // signing up with the invited address is what links the account to the profile,
                // because `AccessManager` matches a profile to an account by email.
                const { memberId } = action.payload; // org_profile_id
                console.log(`DataManager: Requesting invite for member profile ${memberId}`);

                const profile = await dataManager.getOrgProfile(memberId);
                if (!profile) {
                    throw new Error('Member profile not found');
                }
                if ((await accessManager.getUserIdsForOrgProfile(memberId)).length > 0) {
                    throw new Error(`${profile.name} is already on ScoreKeeper.`);
                }

                const email = normalizeEmail(action.payload.email ?? profile.email);
                if (!email) {
                    throw new Error(`${profile.name} has no email address. Enter one to send the invite to.`);
                }
                if (!isValidEmail(email)) {
                    throw new Error(`"${email}" is not a valid email address.`);
                }

                // Saving an account's address to the profile would link that account to it —
                // an identity change the profile edit screen makes deliberately, not an invite.
                const emailHasAccount = await pool.query(
                    `SELECT 1 FROM users WHERE LOWER(email) = $1
                     UNION ALL
                     SELECT 1 FROM user_emails WHERE LOWER(email) = $1 AND verified_at IS NOT NULL
                     LIMIT 1`,
                    [email]
                );
                if (emailHasAccount.rows.length > 0) {
                    throw new Error(`${email} already belongs to a ScoreKeeper account, so there is nobody to invite. To link it to ${profile.name}, set it on their profile.`);
                }

                const settingsRes = await pool.query("SELECT key, value FROM system_settings WHERE key = 'invite_cooldown_hours'");
                const cooldownHours = inviteCooldownHoursFrom(Object.fromEntries(settingsRes.rows.map((r: any) => [r.key, r.value])));
                // `resend` is the deliberate override, for an invite that went astray.
                const waitHours = inviteCooldownRemainingHours(profile, email, cooldownHours);
                if (waitHours > 0 && action.payload.resend !== true) {
                    throw new Error(`An invite already went to ${email}. You can send another in ${formatInviteWait(waitHours)}, or to a different address now.`);
                }

                // Send first: if the email cannot go, nothing is recorded and the admin is told.
                const org = await dataManager.getOrganization(profile.orgId);
                const appUrl = process.env.APP_URL || 'http://localhost:8081';
                const signupUrl = `${appUrl}/signup?email=${encodeURIComponent(email)}`;
                try {
                    await mailManager.sendMemberInvitation(email, profile.name, org?.name || 'Your organisation', signupUrl);
                } catch (mailErr) {
                    console.error('Failed to send member invitation:', mailErr);
                    throw new Error(`The invite to ${email} could not be sent. Nothing was changed; try again later.`);
                }

                const updatedProfile = await dataManager.updateOrgProfile(memberId, {
                    ...(email !== normalizeEmail(profile.email) ? { email } : {}),
                    lastInviteSentAt: new Date().toISOString(),
                    lastInviteEmail: email,
                });

                // Broadcast ORG_MEMBER_UPDATED to all organization admins
                updateTopic = `org:${profile.orgId}:members`;
                updateType = 'ORG_MEMBER_UPDATED';

                const richMember = (await dataManager.getOrganizationMembers(profile.orgId)).find((m: any) => m.id === memberId);
                result = richMember || updatedProfile;

                break;
            }
            case SocketAction.ADD_ORG_PROFILE: {
                // `eventId` authorizes the write (an organiser creating a person to appoint); it is
                // not a column on the profile.
                const { eventId: _appointingEventId, ...addPayload } = { ...action.payload };
                // An uploaded picture is saved by addOrgProfile itself, around the database write.
                result = await dataManager.addOrgProfile(addPayload);
                break;
            }
            case SocketAction.UPDATE_ORG_PROFILE: {
                // `userId` is dropped, always. Re-pointing a profile at a user account is an
                // identity operation rather than a profile edit — it hands over every membership
                // that profile holds — and exactly one caller has business doing it:
                // `UserManager.ensureProfileForUserInOrg`, server-side, when an account claims
                // its profile. No client sends it (`PEOPLE-2`).
                const { userId: _rejectedUserId, ...updateData } = { ...action.payload.data };
                // The invite record is written by SEND_MEMBER_INVITE alone. Editable here, it would
                // let the resend cooldown be cleared by hand.
                delete updateData.lastInviteSentAt;
                delete updateData.lastInviteEmail;
                // A new, replaced or removed picture is handled by updateOrgProfile itself: saved
                // before the write, and the old one deleted after it only if nothing else uses it.
                console.log(`DataManager: Updating org profile ${action.payload.id}`, { ...updateData, image: updateData.image?.startsWith('data:') ? '(upload)' : updateData.image });
                result = await dataManager.updateOrgProfile(action.payload.id, updateData);
                if (result && result.orgId) {
                    updateTopic = `org:${result.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                }
                break;
            }
            case SocketAction.DELETE_ORG_PROFILE:
                console.log(`DataManager: Deleting org profile ${action.payload.id}`);
                result = await dataManager.deleteOrgProfile(action.payload.id);
                break;
            case SocketAction.LINK_USER_PROFILE:
                result = await dataManager.linkUserToProfile(action.payload.email, action.payload.orgProfileId);
                break;
            case SocketAction.CLAIM_ORG:
                result = await dataManager.claimOrganization(action.payload.id, action.payload.userId);
                 if (result) {
                    await publishUserMemberships(action.payload.userId);
                    
                    const role = await dataManager.getOrganizationRole('role-org-admin');
                    const notification = await dataManager.createNotification(
                        action.payload.userId,
                        'Organization Claimed',
                        `You have successfully claimed ${result.name} and are now an ${role?.name || 'Administrator'}.`,
                        'org_added',
                        `/admin/organizations/${result.id}`
                    );
                    if (notification) {
                        broadcast(userNotificationsRoom(action.payload.userId), 'NOTIFICATION_ADDED', notification);
                    }

                    await broadcastOrgSummaries([result.id]);
                 }
                break;
            case SocketAction.CLAIM_ORG_VIA_TOKEN:
                result = await dataManager.claimOrgViaToken(action.payload.token, action.payload.userId);
                if (result) {
                    await publishUserMemberships(action.payload.userId);
                    
                    const role = await dataManager.getOrganizationRole('role-org-admin');
                    const notification = await dataManager.createNotification(
                        action.payload.userId,
                        'Organization Claimed',
                        `You have successfully claimed ${result.name} and are now an ${role?.name || 'Administrator'}.`,
                        'org_added',
                        `/admin/organizations/${result.id}`
                    );
                    if (notification) {
                        broadcast(userNotificationsRoom(action.payload.userId), 'NOTIFICATION_ADDED', notification);
                    }

                    await broadcastOrgSummaries([result.id]);
                }
                break;
            case SocketAction.DECLINE_CLAIM:
                result = await dataManager.declineClaim(action.payload.token);
                // No broadcast needed, just confirmation
                break;
            case SocketAction.REFER_ORG_CONTACT_VIA_TOKEN:
                result = await dataManager.referOrgContactViaToken(action.payload.token, action.payload.contactEmails);
                // No broadcast needed, returns referrals
                break;

            case SocketAction.MARK_NOTIFICATION_READ:
                result = await dataManager.markNotificationAsRead(action.payload.id);
                break;
            case SocketAction.MARK_ALL_NOTIFICATIONS_READ:
                await dataManager.markAllNotificationsAsRead(action.payload.userId);
                result = { status: 'ok' };
                break;
            case SocketAction.DELETE_NOTIFICATION:
                result = await dataManager.deleteNotification(action.payload.id);
                break;
            case SocketAction.SUBMIT_REPORT:
                result = await dataManager.submitReport(action.payload);
                break;
            case SocketAction.GET_USER_BADGES:
                result = await dataManager.getUserBadges(action.payload.userId);
                break;
            case SocketAction.FEED_GET_HOME:
                result = await dataManager.getHomeFeed(action.payload.userId, action.payload.timezone);
                break;
            case SocketAction.RESET_CACHE:
            case SocketAction.GLOBAL_CACHE_REFRESH:
                dataManager.invalidateCache();
                // Signal all clients to refresh their local organization state
                io.emit('update', { type: 'GLOBAL_CACHE_REFRESH', data: {} });
                result = { message: 'Cache invalidated and refresh signal sent' };
                break;

            // --- Tournaments: divisions, stages, entrants (Phase 3) ---------------------
            //
            // Every case below is already authorized by the gate above, so none of them repeats
            // the check. What each one does repeat is publishing: a broadcast carries the data,
            // never a nudge to refetch, and the audience is decided in `wss/tournaments.ts`
            // rather than open-coded here.

            case SocketAction.ADD_DIVISION: {
                const { stage, orgId: _actingOrgId, ...divisionData } = action.payload;
                // U52: a division plays one of the tournament's sports — so there must be one to play,
                // and with only one there is nothing to choose.
                const parentEvent = await dataManager.getEvent(divisionData.eventId);
                const eventSportIds = parentEvent?.sportIds || [];
                if (!eventSportIds.length) {
                    throw new Error("Choose the tournament's sports before adding a division.");
                }
                if (!divisionData.sportId && eventSportIds.length === 1) {
                    divisionData.sportId = eventSportIds[0];
                }
                if (!divisionData.sportId) {
                    throw new Error('Say which sport the new division plays.');
                }
                await assertDivisionSportAllowed(divisionData.eventId, divisionData.sportId);
                await assertDivisionNameFree(divisionData.eventId, divisionData.name);
                const division = await dataManager.addDivision(divisionData);
                // D11: every division has at least one stage. The caller that knows the format
                // says so in the same call rather than making a second round trip, and a division
                // with one stage is what the collapse rule (U15) renders with no stage tabs.
                if (stage) await dataManager.addStage({ ...stage, divisionId: division.id });
                result = await dataManager.getDivisionDetail(division.id);
                await publishDivision(division.id, 'DIVISION_ADDED', result, division.eventId);
                break;
            }

            case SocketAction.UPDATE_DIVISION: {
                const beforeUpdate =
                    action.payload.data?.sportId !== undefined || action.payload.data?.name !== undefined
                        ? await dataManager.getDivision(action.payload.id)
                        : null;
                if (action.payload.data?.name !== undefined) {
                    await assertDivisionNameFree(beforeUpdate?.eventId, action.payload.data.name, action.payload.id);
                }
                if (action.payload.data?.sportId !== undefined) {
                    if (!action.payload.data.sportId) throw new Error('A division has to play a sport.');
                    await assertDivisionSportAllowed(beforeUpdate?.eventId, action.payload.data.sportId, beforeUpdate?.sportId);
                }
                const updated = await dataManager.updateDivision(action.payload.id, action.payload.data);
                if (!updated) throw new Error('Division not found.');
                result = await dataManager.getDivisionDetail(updated.id);
                await publishDivision(updated.id, 'DIVISION_UPDATED', result, updated.eventId);
                // `weighting`, `scoring` and `tiebreakers` all change what the tables say, so this
                // is a standings-changing edit even though no result moved.
                await tournamentManager.recalculateDivision(updated.id);
                await publishStandings(updated.id, updated.eventId);
                // Moving a sport's last division elsewhere takes the sport out of the tournament (U52).
                if (beforeUpdate?.sportId && updated.sportId && beforeUpdate.sportId !== updated.sportId) {
                    await removeSportIfUnused(updated.eventId, beforeUpdate.sportId);
                }
                break;
            }

            case SocketAction.DELETE_DIVISION: {
                // Captured first: afterwards there is no row left to resolve the event from.
                const divisionEventId = await dataManager.getDivisionEventId(action.payload.id);
                const divisionBeforeDelete = await dataManager.getDivision(action.payload.id);
                await assertNotLastDivisionOfDelegatedSport(authUserId, action.payload.orgId, divisionBeforeDelete);
                const removedDivision = await dataManager.deleteDivision(action.payload.id);
                if (!removedDivision) throw new Error('Division not found.');
                result = { id: action.payload.id };
                await publishDivision(action.payload.id, 'DIVISION_DELETED', result, divisionEventId || undefined);
                if (divisionEventId) {
                    await tournamentManager.recalculateEventStandings(divisionEventId);
                    await publishStandings(null, divisionEventId);
                    // A sport's last division takes the sport with it (U52); the screen warns first.
                    await removeSportIfUnused(divisionEventId, divisionBeforeDelete?.sportId);
                }
                break;
            }

            case SocketAction.ADD_STAGE: {
                result = await dataManager.addStage(action.payload);
                publishStages(action.payload.divisionId, await dataManager.getStages(action.payload.divisionId));
                break;
            }

            case SocketAction.UPDATE_STAGE: {
                result = await dataManager.updateStage(action.payload.id, action.payload.data);
                if (!result) throw new Error('Stage not found.');
                publishStages(result.divisionId, await dataManager.getStages(result.divisionId));
                break;
            }

            case SocketAction.DELETE_STAGE: {
                const stageToDelete = await dataManager.getStage(action.payload.id);
                if (!stageToDelete) throw new Error('Stage not found.');
                await dataManager.deleteStage(action.payload.id);
                result = { id: action.payload.id };
                publishStages(stageToDelete.divisionId, await dataManager.getStages(stageToDelete.divisionId));
                await tournamentManager.recalculateDivision(stageToDelete.divisionId);
                await publishStandings(
                    stageToDelete.divisionId,
                    await dataManager.getDivisionEventId(stageToDelete.divisionId)
                );
                break;
            }

            case SocketAction.SET_DIVISION_ENTRANTS: {
                const entrantDivisionId = action.payload.divisionId;
                result = await runIdempotent(action.payload.idempotencyKey, async () => {
                    const outcome = await dataManager.setDivisionEntrants(
                        entrantDivisionId,
                        action.payload.entrants || [],
                        {
                            takeFromOtherDivisions: !!action.payload.takeFromOtherDivisions,
                            removeEntrantIds: action.payload.removeEntrantIds || [],
                        }
                    );
                    // A roster edit can be a substitution (D10), which changes who every fixture
                    // pointing at that entrant was played by — so the tables are rebuilt whether
                    // or not a result moved. D10 is explicit that a substitution does not touch
                    // the draw: the fixtures stay exactly where they are.
                    await tournamentManager.recalculateDivision(entrantDivisionId);
                    // A **Move here** takes the team out of another division in the same write, so
                    // that division's table is as wrong as this one's until it is rebuilt too.
                    for (const vacated of outcome.vacated) {
                        await tournamentManager.recalculateDivision(vacated.divisionId);
                    }
                    return {
                        applied: outcome.entrants,
                        errors: [],
                        syncedStageIds: outcome.syncedStageIds,
                        vacated: outcome.vacated,
                    };
                });
                const entrantEventId = await dataManager.getDivisionEventId(entrantDivisionId);
                await publishEntrants(entrantDivisionId, result.applied, entrantEventId || undefined);
                // The roster mirrored itself into the stage that simply takes it, so the division
                // panel's pool membership moved too — say so rather than letting it go stale until
                // the next join.
                for (const syncedStageId of result.syncedStageIds || []) {
                    publishStageEntrants(
                        entrantDivisionId,
                        syncedStageId,
                        await dataManager.getStageEntrants(syncedStageId)
                    );
                }
                if (result.syncedStageIds?.length) {
                    publishStages(entrantDivisionId, await dataManager.getStages(entrantDivisionId));
                }
                await publishStandings(entrantDivisionId, entrantEventId);
                // Resolving an entrant fills in every fixture that names it at once, so those
                // summaries go out too — that is the whole point of the placeholder model.
                for (const game of await dataManager.getDivisionGames(entrantDivisionId)) {
                    await publishGameSummary(game.id);
                }
                /*
                 * A **Move here** edited two divisions, and the one that lost the team has viewers
                 * of its own. Publishing only the destination would leave the source showing a
                 * team that is no longer in it until somebody reloaded — the `FIX-4` shape, and
                 * worse here because the stale side is the one nobody is looking at while they
                 * make the change. Its fixtures go out too: removing an entrant unresolves every
                 * fixture that named it.
                 */
                for (const vacated of result.vacated || []) {
                    await publishEntrants(
                        vacated.divisionId,
                        await dataManager.getDivisionEntrants(vacated.divisionId),
                        entrantEventId || undefined
                    );
                    for (const syncedStageId of vacated.syncedStageIds) {
                        publishStageEntrants(
                            vacated.divisionId,
                            syncedStageId,
                            await dataManager.getStageEntrants(syncedStageId)
                        );
                    }
                    if (vacated.syncedStageIds.length) {
                        publishStages(vacated.divisionId, await dataManager.getStages(vacated.divisionId));
                    }
                    await publishStandings(vacated.divisionId, entrantEventId);
                    for (const game of await dataManager.getDivisionGames(vacated.divisionId)) {
                        await publishGameSummary(game.id);
                    }
                }
                break;
            }

            case SocketAction.SET_STAGE_ENTRANTS: {
                const entrantStage = await dataManager.getStage(action.payload.stageId);
                if (!entrantStage) throw new Error('Stage not found.');
                result = await runIdempotent(action.payload.idempotencyKey, async () => ({
                    applied: await dataManager.setStageEntrants(action.payload.stageId, action.payload.entrants || []),
                    errors: [],
                }));
                publishStageEntrants(entrantStage.divisionId, entrantStage.id, result.applied);
                publishStages(entrantStage.divisionId, await dataManager.getStages(entrantStage.divisionId));
                break;
            }

            case SocketAction.GENERATE_STAGE_FIXTURES: {
                result = await runIdempotent(action.payload.idempotencyKey, async () => {
                    const outcome = await dataManager.generateStageFixtures(
                        action.payload.stageId,
                        action.payload.mode,
                        action.payload.deleteResults
                    );
                    return { ...outcome, updated: 0, games: await dataManager.getStageGames(action.payload.stageId) };
                });
                // Rule 3: one broadcast for the whole batch. Ninety fixtures published one at a
                // time would put back on the client exactly the cost the contract removed.
                publishStageFixtures(result.divisionId, result.stageId, result.games);
                publishStages(result.divisionId, await dataManager.getStages(result.divisionId));
                await publishStandings(result.divisionId, result.eventId);
                break;
            }

            case SocketAction.SCHEDULE_STAGE: {
                result = await runIdempotent(action.payload.idempotencyKey, async () => {
                    const outcome = await dataManager.scheduleStage(action.payload);
                    return {
                        ...outcome,
                        created: 0,
                        deleted: 0,
                        updated: outcome.scheduled,
                        games: await dataManager.getStageGames(action.payload.stageId),
                    };
                });
                publishStageFixtures(result.divisionId, result.stageId, result.games);
                // A rescheduled fixture changes what every org's list shows, not only the division
                // screen's — so each publishes a summary through the ordinary fixture path.
                for (const game of result.games) await publishGameSummary(game.id);
                break;
            }

            case SocketAction.ADD_GAMES: {
                result = await runIdempotent(action.payload.idempotencyKey, async () => {
                    const outcome = await tournamentManager.addGamesBatch(action.payload.games || []);
                    if (outcome.errors.length) throw new BatchFailed(outcome.errors);
                    const applied = [];
                    for (const id of outcome.ids) {
                        const summary = await dataManager.getGameSummary(id);
                        if (summary) applied.push(summary);
                    }
                    return { applied, errors: [] };
                });
                for (const game of result.applied) await publishGameSummary(game.id);
                break;
            }

            case SocketAction.UPDATE_GAMES: {
                result = await runIdempotent(action.payload.idempotencyKey, async () => {
                    const outcome = await tournamentManager.updateGamesBatch(action.payload.games || []);
                    if (outcome.errors.length) throw new BatchFailed(outcome.errors);
                    const applied = [];
                    for (const id of outcome.ids) {
                        const summary = await dataManager.getGameSummary(id);
                        if (summary) applied.push(summary);
                    }
                    return { applied, errors: [] };
                });
                for (const game of result.applied) await publishGameSummary(game.id);
                break;
            }

            case SocketAction.RESOLVE_PARTICIPANT: {
                const resolvedGameId = await tournamentManager.resolveParticipant(
                    action.payload.gameParticipantId,
                    action.payload
                );
                if (!resolvedGameId) throw new Error('That fixture side does not exist.');
                await publishGameSummary(resolvedGameId);
                // Filling a slot by hand is a result-affecting change: the fixture is now between
                // two known competitors, and the table has to count it as such.
                await dataManager.recalculateStandingsForGame(resolvedGameId);
                result = await dataManager.getGameSummary(resolvedGameId);
                break;
            }

            case SocketAction.ADD_ADJUSTMENT: {
                result = await dataManager.addAdjustment({
                    ...action.payload,
                    createdByUserId: authUserId || undefined,
                });
                await tournamentManager.recalculateDivision(action.payload.divisionId);
                publishAdjustments(
                    action.payload.divisionId,
                    await dataManager.getDivisionAdjustments(action.payload.divisionId)
                );
                await publishStandings(
                    action.payload.divisionId,
                    await dataManager.getDivisionEventId(action.payload.divisionId)
                );
                break;
            }

            case SocketAction.DELETE_ADJUSTMENT: {
                const removedAdjustment = await dataManager.deleteAdjustment(action.payload.id);
                if (!removedAdjustment) throw new Error('Adjustment not found.');
                result = { id: removedAdjustment.id };
                await tournamentManager.recalculateDivision(removedAdjustment.divisionId);
                publishAdjustments(
                    removedAdjustment.divisionId,
                    await dataManager.getDivisionAdjustments(removedAdjustment.divisionId)
                );
                await publishStandings(
                    removedAdjustment.divisionId,
                    await dataManager.getDivisionEventId(removedAdjustment.divisionId)
                );
                break;
            }

            case SocketAction.SET_EVENT_FACILITIES: {
                const eventFacilityIds = await dataManager.setEventFacilities(
                    action.payload.eventId,
                    action.payload.facilityIds || []
                );
                result = { eventId: action.payload.eventId, facilityIds: eventFacilityIds };
                broadcast(eventFacilitiesRoom(action.payload.eventId), 'EVENT_FACILITIES_SYNC', result);
                break;
            }

            case SocketAction.APPOINT_ORGANIZER: {
                const { orgProfileId } = action.payload;
                const appointScope = organizerScopeOf(action.payload);
                if (!appointScope) throw new Error(NO_ORGANIZER_SCOPE);
                const appointScopeEventId = await organizerScopeEventId(appointScope);
                if (!appointScopeEventId) throw new Error('That tournament no longer exists.');

                // Recorded as the profile the appointer's own permission came through, so the audit
                // line names a person as their organisation knows them. Null for an app admin who
                // holds no profile in any org involved, which the column allows for.
                const grantedBy = await dataManager.resolveGrantingProfile(
                    authUserId!,
                    appointScopeEventId,
                    appointScope.kind === 'division' ? appointScope.divisionId : undefined,
                    await grantingSportFor(appointScope)
                );
                const appointed = await dataManager.appointOrganizer({
                    ...organizerScopeFields(appointScope),
                    orgProfileId,
                    grantedByOrgProfileId: grantedBy,
                });
                result = {
                    ...organizerScopeFields(appointScope),
                    organizers: await organizersForCaller(authUserId, appointScope, appointed),
                };
                await publishOrganizerChange(orgProfileId, appointScopeEventId);
                break;
            }

            case SocketAction.WITHDRAW_ORGANIZER: {
                const { orgProfileId: withdrawnProfileId } = action.payload;
                const withdrawScope = organizerScopeOf(action.payload);
                if (!withdrawScope) throw new Error(NO_ORGANIZER_SCOPE);
                const withdrawScopeEventId = await organizerScopeEventId(withdrawScope);
                if (!withdrawScopeEventId) throw new Error('That tournament no longer exists.');

                // D33, revised 2026-09-19 and widened 2026-09-20: somebody holding a narrow scope
                // may withdraw only the people they appointed. The gate let them this far on their
                // division or sport grant; whether this particular row is theirs to remove is only
                // knowable here. Event organisers - and anyone the event already trusts - remove
                // anybody, which is why the event scope skips the check entirely.
                if (withdrawScope.kind !== 'event') {
                    const withdrawEvent = await dataManager.getEvent(withdrawScopeEventId);
                    const actsForEvent = !!withdrawEvent && await dataManager.canEditEventOrGame(
                        authUserId!,
                        action.payload.orgId || withdrawEvent.orgId,
                        withdrawScopeEventId
                    );
                    if (!actsForEvent) {
                        const held = withdrawScope.kind === 'division'
                            ? await dataManager.getDivisionOrganizers(withdrawScope.divisionId)
                            : await dataManager.getSportOrganizers(withdrawScope.eventId, withdrawScope.sportId);
                        const grant = held.find((row: any) => row.orgProfileId === withdrawnProfileId);
                        const appointedByCaller = !!grant?.grantedByOrgProfileId &&
                            await dataManager.ownsOrgProfile(authUserId!, grant.grantedByOrgProfileId);
                        if (!appointedByCaller) {
                            throw new Error(
                                withdrawScope.kind === 'division'
                                    ? "You can only remove convenors you added yourself. Ask the tournament's organisers to remove this one."
                                    : "You can only remove organisers you added yourself. Ask the tournament's organisers to remove this one."
                            );
                        }
                    }
                }

                const remaining = await dataManager.withdrawOrganizer({
                    ...organizerScopeFields(withdrawScope),
                    orgProfileId: withdrawnProfileId,
                });
                result = {
                    ...organizerScopeFields(withdrawScope),
                    organizers: await organizersForCaller(authUserId, withdrawScope, remaining),
                };
                // Published *after* the delete, so the recomputed capabilities are the ones the
                // withdrawal leaves behind — and so the room revalidation it triggers closes the
                // rooms the grant was holding open.
                await publishOrganizerChange(withdrawnProfileId, withdrawScopeEventId);
                break;
            }

            case SocketAction.SET_DIVISION_FACILITIES: {
                const divisionFacilityIds = await dataManager.setDivisionFacilities(
                    action.payload.divisionId,
                    action.payload.facilityIds || []
                );
                result = { divisionId: action.payload.divisionId, facilityIds: divisionFacilityIds };
                broadcast(divisionFacilitiesRoom(action.payload.divisionId), 'DIVISION_FACILITIES_SYNC', result);

                // The division itself carries `facilityIds` now, and the event screen lists every
                // division with the fields it uses — so the event room has to hear about this too,
                // or that list goes stale the moment a convenor narrows their own division
                // (`LIVE-8`, again). Republishing the division serves both rooms with one shape.
                const facilitiesDivision = await dataManager.getDivision(action.payload.divisionId);
                if (facilitiesDivision) {
                    broadcast(divisionRoom(action.payload.divisionId), 'DIVISION_UPDATED', facilitiesDivision);
                    if (facilitiesDivision.eventId) {
                        broadcast(eventDivisionsRoom(facilitiesDivision.eventId), 'DIVISION_UPDATED', facilitiesDivision);
                    }
                }
                break;
            }

            default:
                console.warn('Unknown action type:', action.type);
        }

        if (updateTopic && result) {
            broadcast(updateTopic, updateType, result);
            console.log(`Broadcasted ${updateType} to ${updateTopic}`);
        }
        
        // Standings Broadcast Helper
        if (result && result.id && (
            action.type === SocketAction.UPDATE_GAME ||
            action.type === SocketAction.UPDATE_GAME_STATUS ||
            action.type === SocketAction.RECORD_GAME_RESULT ||
            action.type === SocketAction.UPDATE_GAME_SCORE ||
            action.type === SocketAction.RESET_GAME ||
            action.type === SocketAction.ADD_GAME_EVENT ||
            action.type === SocketAction.UPDATE_GAME_EVENT ||
            action.type === SocketAction.UNDO_GAME_EVENT
        )) {
            const seasonIds = await dataManager.getGameSeasons(result.id);
            for (const seasonId of seasonIds) {
                const updatedSeason = await dataManager.getSeason(seasonId);
                if (updatedSeason) {
                    additionalBroadcasts.push({
                        topic: `season:${seasonId}:standings`,
                        type: 'STANDINGS_UPDATED',
                        data: updatedSeason.cachedStandings
                    });
                }
            }
        }

        // `broadcast()` logs each publish itself (wss/socketLog.ts), so there is no line here.
        additionalBroadcasts.forEach(b => broadcast(b.topic, b.type, b.data));

        // Nothing happened, so this is not a success (SYNC-1). Every handler returns what it changed
        // — the record, `true`, an id — and a manager answers `null`/`false` when its target is gone
        // (deleted or changed by someone else a moment ago). Answering ok with `data: null` there
        // told the user their change had saved.
        if (result === null || result === undefined || result === false) {
            throw new Error('That change did not happen — what it applied to no longer exists. It may have been deleted or changed by someone else; refresh and try again.');
        }

        // The one success exit: the result travels in `data` (ActionAck), never as the ack itself.
        if (callback) callback({ status: 'ok', data: result } satisfies ActionAck);

    } catch (error: any) {
        console.error(`Server: Error handling action ${action.type}:`, error);
        recordFailure({
            source: 'server',
            kind: 'refused',
            actionType: action.type,
            message: error.message || 'Internal server error',
            userId: authUserId,
            requestId: typeof (action as any).requestId === 'string' ? (action as any).requestId : undefined,
        });
        if (callback) callback({ status: 'error', message: error.message || 'Internal server error' } satisfies ActionAck);
    }
  };

  /*
    Every action may carry a `requestId` (SYNC-3). The client keeps it across retries of the same
    attempt — its own automatic retry after a lost reply, and a user pressing Save again after
    "no answer" — so a repeat returns the first attempt's answer instead of applying the change
    twice. Scoped to the caller, so two users can never collide. Only successes are remembered: a
    refused attempt is one the client genuinely wants to run again. In memory and short-lived — see
    `wss/batch.ts` for what that does and does not cover.
  */
  socket.on('action', async (action: { type: SocketAction, payload: any, requestId?: unknown }, callback) => {
    const requestId = action && typeof action === 'object' && typeof action.requestId === 'string'
        ? action.requestId
        : undefined;
    if (!requestId) return runAction(action, callback);

    const replayKey = `action:${socket.data?.userId || socket.id}:${action.type}:${requestId}`;
    try {
        const ack = await runIdempotent(replayKey, () => new Promise<ActionAck & object>((resolve, reject) => {
            runAction(action, (reply) => (reply.status === 'ok' ? resolve(reply) : reject(new RefusedAck(reply))));
        }));
        if (callback) callback(ack);
    } catch (error: any) {
        if (callback) {
            callback(error instanceof RefusedAck
                ? error.ack
                : { status: 'error', message: error?.message || 'Internal server error' } satisfies ActionAck);
        }
    }
  });

  /*
    Failures the client met that the server never saw — no answer, a reply it could not read —
    reported in batches by `expo-app/services/clientFailures.ts` (SYNC-2). Refusals are not among
    them: the server records those itself, in the action handler's catch.
    Written to the failures log with the socket's own user id, never one the client claims. Bounded
    per message and per minute, so a client stuck in a failure loop cannot fill the disk.
  */
  let failureReportWindowStart = 0;
  let failureReportsInWindow = 0;
  socket.on('client_failures', (items: unknown) => {
    if (!Array.isArray(items)) return;
    const now = Date.now();
    if (now - failureReportWindowStart > 60_000) {
      failureReportWindowStart = now;
      failureReportsInWindow = 0;
    }
    const text = (value: unknown, max: number) =>
        typeof value === 'string' ? value.slice(0, max) : undefined;
    for (const item of items.slice(0, 20)) {
        if (failureReportsInWindow >= 60) break;
        if (!item || typeof item !== 'object') continue;
        const kind = (item as any).kind;
        if (kind !== 'refused' && kind !== 'no-answer' && kind !== 'unexpected-reply') continue;
        failureReportsInWindow++;
        recordFailure({
            source: 'client',
            kind,
            actionType: text((item as any).actionType, 64),
            message: text((item as any).message, 500) || '',
            userId: socket.data?.userId || null,
            requestId: text((item as any).requestId, 64),
            occurredAt: text((item as any).occurredAt, 40),
            platform: text((item as any).platform, 20),
            screen: text((item as any).screen, 200),
        });
    }
  });

  socket.on('disconnect', (reason) => {
    const clientIp = (socket as any).clientIp || socket.handshake.address || 'unknown';
    const userId = (socket as any).userId || 'anonymous';
    console.log(`[Socket] Connection closed: ID=${socket.id} IP=${clientIp} User=${userId} Reason=${reason}`);
  });
});

// Rehydrate active disputes immediately on start
gameEventManager.rehydrateDisputes().catch(err => {
  console.error('[Dispute System] Failed to rehydrate disputes on startup:', err);
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
