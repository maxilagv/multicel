export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
};

export type LoginError = {
  error?: string;
  errors?: { msg: string; param: string }[];
};

