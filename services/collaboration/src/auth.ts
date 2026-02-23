import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface TokenPayload {
  id: string;
  email?: string;
  name?: string;
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as any;
  // NextAuth v5 JWT structure: { sub: userId, ... }
  return {
    id: decoded.sub || decoded.id,
    email: decoded.email,
    name: decoded.name,
  };
}
