import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user || !user.passwordHash) return null

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'google') {
          // Google OAuth の user オブジェクトには tenantId/role が含まれないためDBから取得
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
            select: { id: true, tenantId: true, role: true },
          })
          if (!dbUser) {
            throw new Error('User not found in database')
          }
          token.tenantId = dbUser.tenantId
          token.role = dbUser.role
          token.userId = dbUser.id
        } else {
          token.tenantId = (user as any).tenantId
          token.role = (user as any).role
          token.userId = user.id
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.tenantId = token.tenantId as string
        session.user.role = token.role as string
        session.user.userId = token.userId as string
      }
      return session
    },
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        })
        if (!existingUser) {
          return false
        }
        await prisma.user.update({
          where: { email: user.email! },
          data: { image: user.image },
        })
      }
      return true
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
})
