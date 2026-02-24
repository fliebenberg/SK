import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Pool } from "pg";
import { imageService } from "@/lib/ImageService";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  
  // Fetch user details and linked social accounts
  const userRes = await pool.query(
    "SELECT name, image, custom_image, avatar_source, theme FROM users WHERE id = $1",
    [userId]
  );
  
  const accountsRes = await pool.query(
    "SELECT provider, provider_image FROM accounts WHERE user_id = $1",
    [userId]
  );

  return NextResponse.json({
    user: userRes.rows[0],
    socialAccounts: accountsRes.rows
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const data = await req.json();

  const { name, image, password, avatarSource, customImage, theme } = data;

  if (name) {
    await pool.query("UPDATE users SET name = $1 WHERE id = $2", [name, userId]);
  }
  
  // 'image' from the legacy UI is now treated as 'customImage'
  let finalCustomImage = customImage || image;
  if (finalCustomImage && finalCustomImage.startsWith('data:image')) {
    // Optional: delete old avatar file if it exists
    const oldUserRes = await pool.query("SELECT custom_image FROM users WHERE id = $1", [userId]);
    const oldCustomImage = oldUserRes.rows[0]?.custom_image;
    if (oldCustomImage) {
        await imageService.deleteAvatar(oldCustomImage);
    }

    finalCustomImage = await imageService.processAvatar(finalCustomImage, userId);
    await pool.query("UPDATE users SET custom_image = $1 WHERE id = $2", [finalCustomImage, userId]);
  } else if (finalCustomImage) {
    // If it's already a filename (e.g. from a previous update or some other logic), just update the DB
    await pool.query("UPDATE users SET custom_image = $1 WHERE id = $2", [finalCustomImage, userId]);
  }
  
  if (avatarSource) {
    await pool.query("UPDATE users SET avatar_source = $1 WHERE id = $2", [avatarSource, userId]);
    
    // Sync main 'image' field for legacy components and JWT fallback
    if (avatarSource === 'custom' && finalCustomImage) {
        await pool.query("UPDATE users SET image = $1 WHERE id = $2", [finalCustomImage, userId]);
    } else if (avatarSource !== 'custom') {
        const accRes = await pool.query("SELECT provider_image FROM accounts WHERE user_id = $1 AND provider = $2", [userId, avatarSource]);
        if (accRes.rows[0]?.provider_image) {
            await pool.query("UPDATE users SET image = $1 WHERE id = $2", [accRes.rows[0].provider_image, userId]);
        }
    }
  }

  if (password) {
    const { compare, hash } = await import("bcryptjs");
    
    // If the user already has a password, we must verify the old one
    const existingPassRes = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const existingHash = existingPassRes.rows[0]?.password_hash;
    
    if (existingHash) {
      if (!data.oldPassword) {
        return NextResponse.json({ message: "Current password is required" }, { status: 400 });
      }
      
      const isMatch = await compare(data.oldPassword, existingHash);
      if (!isMatch) {
        return NextResponse.json({ message: "Incorrect current password" }, { status: 403 });
      }
    }

    const passwordHash = await hash(password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
  }
  
  if (theme) {
    await pool.query("UPDATE users SET theme = $1 WHERE id = $2", [theme, userId]);
  }

  return NextResponse.json({ success: true });
}
