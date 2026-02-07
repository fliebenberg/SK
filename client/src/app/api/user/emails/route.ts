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
  const res = await pool.query("SELECT * FROM user_emails WHERE user_id = $1", [userId]);
  return NextResponse.json(res.rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { email } = await req.json();

  if (!email) return NextResponse.json({ message: "Email required" }, { status: 400 });

  // Check if email already linked
  const checkRes = await pool.query("SELECT id FROM user_emails WHERE email = $1", [email]);
  if (checkRes.rowCount! > 0) {
    return NextResponse.json({ message: "Email already linked to an account" }, { status: 400 });
  }

  const id = `email-${Date.now()}`;
  const res = await pool.query(
    "INSERT INTO user_emails (id, user_id, email, is_primary, verified_at) VALUES ($1, $2, $3, $4, NULL) RETURNING *",
    [id, userId, email, false]
  );

  // TODO: Send verification email

  return NextResponse.json(res.rows[0]);
}
