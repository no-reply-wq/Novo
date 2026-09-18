import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
      isPlatformAdmin: boolean;
      tenantId?: string;
      tenantSlug?: string;
      schemaName?: string;
      roleId?: string;
      roleName?: string;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    isPlatformAdmin?: boolean;
    tenantId?: string;
    tenantSlug?: string;
    schemaName?: string;
    roleId?: string;
    roleName?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    isPlatformAdmin: boolean;
    tenantId?: string;
    tenantSlug?: string;
    schemaName?: string;
    roleId?: string;
    roleName?: string;
  }
}
