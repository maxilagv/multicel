export type LoginResponse = {
  accessToken?: string;
  refreshToken?: string;
  mfa_required?: boolean;
  code?: string;
  error?: string;
};

export type LoginError = {
  error?: string;
  code?: string;
  mfa_required?: boolean;
  errors?: { msg: string; param: string }[];
};
