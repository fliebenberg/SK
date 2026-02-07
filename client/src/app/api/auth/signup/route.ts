import { NextResponse } from "next/server";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    // Check if user exists
    const checkRes = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (checkRes.rowCount! > 0) {
      return NextResponse.json({ message: "User already exists" }, { status: 400 });
    }

    const id = `user-${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, global_role) VALUES ($1, $2, $3, $4, $5)",
      [id, name, email, passwordHash, 'user']
    );

    // Also add to user_emails
    await pool.query(
      "INSERT INTO user_emails (id, user_id, email, is_primary, verified_at) VALUES ($1, $2, $3, $4, NOW())",
      [`email-${Date.now()}`, id, email, true]
    );

    return NextResponse.json({ message: "User created successfully" }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
