declare module "#auth-utils" {
  interface User {
    id: number;
  }
  interface SecureSessionData {
    accountKey?: string;
    authMethod?: "password" | "discord" | "google";
    reauthenticatedAt?: number;
  }
}
export {};
