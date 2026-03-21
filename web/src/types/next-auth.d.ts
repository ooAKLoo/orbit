import "next-auth";
import "@auth/core/types";
import "@auth/core/jwt";

declare module "@auth/core/types" {
  interface Session {
    authToken?: string;
    userId?: string;
    plan?: string;
    dailyLimit?: number;
    retentionDays?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    authToken?: string;
    userId?: string;
    plan?: string;
    dailyLimit?: number;
    retentionDays?: number;
    avatarUrl?: string;
  }
}
