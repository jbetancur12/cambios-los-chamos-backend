import jwt from 'jsonwebtoken'

const EMAIL_VERIFICATION_SECRET = process.env.EMAIL_VERIFICATION_SECRET || 'email-secret'

export function generateEmailVerificationToken(email: string): string {
  return jwt.sign({ email }, EMAIL_VERIFICATION_SECRET, { expiresIn: '10m' })
}

export function verifyEmailVerificationToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, EMAIL_VERIFICATION_SECRET) as { email: string }
    return decoded.email
  } catch {
    return null
  }
}
