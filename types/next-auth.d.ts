import 'next-auth'

declare module 'next-auth' {
  interface User {
    tenantId?: string
    role?: string
    userId?: string
  }
  interface Session {
    user: {
      tenantId: string
      role: string
      userId: string
      email: string
      name: string
      image?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tenantId?: string
    role?: string
    userId?: string
  }
}
