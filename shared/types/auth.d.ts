declare module "#auth-utils" {
  interface User {
    id: number;
  }
  interface SecureSessionData {
    linkAccountId?: number;
  }
}
export {};
