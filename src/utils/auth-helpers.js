import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Generates a signed JWT access token for a user.
 * 
 * @param {object} user User object containing id and email
 * @returns {string} Signed JWT token
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    config.accessTokenSecret,
    { expiresIn: '30d' } // Match NextAuth 30-day session lifespan
  );
}

/**
 * Verifies a JWT token.
 * 
 * @param {string} token JWT token string
 * @returns {object|null} Decoded token payload or null if invalid
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, config.accessTokenSecret);
  } catch (error) {
    return null;
  }
}

/**
 * Attaches the JWT token to HTTP-Only cookies.
 * 
 * @param {object} res Express response object
 * @param {string} token Signed JWT token
 */
export function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true in production
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
    path: '/'
  });
}

/**
 * Clears the auth cookie from the response.
 * 
 * @param {object} res Express response object
 */
export function clearAuthCookie(res) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}
