import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password required");
        }

        const res = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [credentials.email]
        );
        const user = res.rows[0];

        if (!user) {
          throw new Error("EMAIL_NOT_FOUND");
        }

        if (!user.password_hash) {
          throw new Error("SOCIAL_ONLY");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password_hash);

        if (!isValid) {
          throw new Error("PASSWORD_MISMATCH");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          globalRole: user.global_role,
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider && account.provider !== "credentials" && user.email) {
        const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL;
        const isAdminMatch = user.email === initialAdminEmail;
        const role = isAdminMatch ? 'admin' : 'user';

        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [user.email]);
        let userId: string;
        
        if (existingUser.rowCount === 0) {
          // Create user if they don't exist
          userId = `user-${account.provider}-${profile?.sub || Date.now()}`;
          await pool.query(
            "INSERT INTO users (id, name, email, image, global_role, avatar_source) VALUES ($1, $2, $3, $4, $5, $6)",
            [userId, user.name, user.email, user.image, role, account.provider]
          );
          // Also add to user_emails
          await pool.query(
            "INSERT INTO user_emails (id, user_id, email, is_primary, verified_at) VALUES ($1, $2, $3, $4, $5)",
            [`email-${Date.now()}`, userId, user.email, true, new Date()]
          );
        } else {
          userId = existingUser.rows[0].id;
          // Promote if email matches INITIAL_ADMIN_EMAIL
          if (isAdminMatch) {
            await pool.query("UPDATE users SET global_role = 'admin' WHERE id = $1", [userId]);
          }
        }
        
        // Ensure this verified email is linked to the user in user_emails (UPSERT)
        await pool.query(`
          INSERT INTO user_emails (id, user_id, email, is_primary, verified_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (email) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            verified_at = COALESCE(user_emails.verified_at, EXCLUDED.verified_at)
        `, [`email-${Date.now()}`, userId, user.email, true]);
        
        user.id = userId;

        // Sync Account record (Social provider profile)
        const accountId = `acc-${account.provider}-${account.providerAccountId}`;
        await pool.query(`
          INSERT INTO accounts (id, user_id, type, provider, provider_account_id, access_token, refresh_token, expires_at, provider_image)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (provider, provider_account_id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            provider_image = EXCLUDED.provider_image
        `, [
          accountId, 
          userId, 
          account.type, 
          account.provider, 
          account.providerAccountId, 
          account.access_token, 
          account.refresh_token, 
          account.expires_at,
          user.image // The current profile pic from the social provider
        ]);
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.globalRole = (user as any).globalRole;
      }
      
      // Fetch latest data from DB to be source of truth
      const res = await pool.query(
        "SELECT name, image, global_role, password_hash, custom_image, avatar_source, theme FROM users WHERE id = $1", 
        [token.id]
      );
      const dbUser = res.rows[0];
      
      if (dbUser) {
        token.name = dbUser.name;
        token.globalRole = dbUser.global_role;
        token.hasPassword = !!dbUser.password_hash;
        token.avatarSource = dbUser.avatar_source;
        token.customImage = dbUser.custom_image;
        token.theme = dbUser.theme;
        
        // Determine active image based on avatar_source
        if (!dbUser.avatar_source || dbUser.avatar_source === 'custom') {
          // If no source or custom, use custom_image, or fallback to the initial social image 'image' if custom is missing
          token.picture = dbUser.custom_image || dbUser.image || null;
        } else {
          // Fetch from accounts table for that provider
          const accRes = await pool.query(
            "SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2",
            [token.id, dbUser.avatar_source]
          );
          // Use provider image, or fall back to the main user.image (initial social) if account record has no image
          token.picture = accRes.rows[0]?.provider_image || dbUser.image || null;
        }
      }

      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.image !== undefined) token.picture = session.image;
        if (session.avatarSource !== undefined) token.avatarSource = session.avatarSource;
        if (session.customImage !== undefined) token.customImage = session.customImage;
        if (session.theme !== undefined) token.theme = session.theme;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).globalRole = token.globalRole;
        (session.user as any).hasPassword = token.hasPassword;
        // Sync name and image from token to session
        if (token.name !== undefined) session.user.name = token.name as string;
        if (token.picture !== undefined) session.user.image = token.picture as string;
        (session.user as any).avatarSource = token.avatarSource;
        (session.user as any).customImage = token.customImage;
        (session.user as any).theme = token.theme;
      }
      return session;
    }
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
