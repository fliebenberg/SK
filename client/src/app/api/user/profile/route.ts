import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Pool } from "pg";

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
  const finalCustomImage = customImage || image;
  if (finalCustomImage) {
    await pool.query("UPDATE users SET custom_image = $1 WHERE id = $2", [finalCustomImage, userId]);
  }
  
  if (avatarSource) {
    await pool.query("UPDATE users SET avatar_source = $1 WHERE id = $2", [avatarSource, userId]);
  }

  if (password) {
    const { hash } = await import("bcryptjs");
    const passwordHash = await hash(password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
  }
  
  if (theme) {
    await pool.query("UPDATE users SET theme = $1 WHERE id = $2", [theme, userId]);
  }

  return NextResponse.json({ success: true });
}
