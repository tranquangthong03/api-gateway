import { pool } from '../infra/db.js';

export const createUser = async ({ email, passwordHash, fullName, role = 'user' }) => {
  const query = `
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, full_name, role, is_active, created_at, updated_at
  `;
  const values = [email, passwordHash, fullName || null, role];
  const res = await pool.query(query, values);
  return res.rows[0];
};

export const findUserByEmail = async (email) => {
  const query = `
    SELECT id, email, password_hash, full_name, role, is_active, created_at, updated_at
    FROM users
    WHERE email = $1
  `;
  const res = await pool.query(query, [email]);
  return res.rows[0] || null;
};

export const findUserById = async (id) => {
  const query = `
    SELECT id, email, password_hash, full_name, role, is_active, created_at, updated_at
    FROM users
    WHERE id = $1
  `;
  const res = await pool.query(query, [id]);
  return res.rows[0] || null;
};
