import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { Pool } from "pg";
import { compare } from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { password } = await req.json();

  if (!password) {
    return NextResponse.json({ message: "Password is required" }, { status: 400 });
  }

  try {
    const res = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const hash = res.rows[0]?.password_hash;

    if (!hash) {
      return NextResponse.json({ message: "No password set for this account" }, { status: 400 });
    }

    const isMatch = await compare(password, hash);
    if (!isMatch) {
      return NextResponse.json({ message: "Incorrect password" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password verification error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
