export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: string;
      };
      membership?: {
        organizationId: string;
        role: string;
      };
      organizationAccess?: {
        organizationId: string;
        exists: boolean;
      };
    }
  }
}
