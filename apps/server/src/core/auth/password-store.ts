import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { dirname } from "path";

const PASSWORD_MIN_LENGTH = 8;

type PasswordMode = "none" | "env" | "file";

type PasswordRecord = {
  version: 1;
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
};

type PasswordResult =
  | { ok: true; snapshot: PasswordSnapshot }
  | { ok: false; status: number; error: string };

export type PasswordSnapshot = {
  required: boolean;
  mode: PasswordMode;
  canRegister: boolean;
  username: string | null;
};

const normalizeUsername = (value: string) => {
  const trimmed = String(value || "").trim();
  return trimmed || "admin";
};

const hashPassword = (password: string, salt: string) => {
  return scryptSync(password, salt, 64).toString("hex");
};

const safeHexEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const readPasswordRecord = (authFile: string, logger: Console): PasswordRecord | null => {
  if (!existsSync(authFile)) return null;
  try {
    const raw = readFileSync(authFile, "utf8");
    const parsed = JSON.parse(raw) as PasswordRecord;
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.username || !parsed.salt || !parsed.hash) return null;
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn?.(`[loong] failed to read auth store: ${message}`);
    return null;
  }
};

const writePasswordRecord = (authFile: string, record: PasswordRecord): PasswordResult => {
  try {
    mkdirSync(dirname(authFile), { recursive: true });
    writeFileSync(authFile, JSON.stringify(record, null, 2));
    return {
      ok: true,
      snapshot: {
        required: true,
        mode: "file",
        canRegister: false,
        username: record.username,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 500, error: message };
  }
};

const buildRecord = ({
  username,
  password,
  previous,
}: {
  username: string;
  password: string;
  previous?: PasswordRecord | null;
}): PasswordRecord => {
  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  return {
    version: 1,
    username,
    salt,
    hash: hashPassword(password, salt),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
};

const validatePassword = (password: string): { ok: true } | { ok: false; error: string } => {
  const value = typeof password === "string" ? password : "";
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  return { ok: true };
};

export const createPasswordStore = ({
  authFile,
  envPassword = "",
  logger = console,
}: {
  authFile: string;
  envPassword?: string;
  logger?: Console;
}) => {
  const getMode = (): PasswordMode => {
    if (envPassword) return "env";
    return readPasswordRecord(authFile, logger) ? "file" : "none";
  };

  const getSnapshot = (): PasswordSnapshot => {
    const mode = getMode();
    if (mode === "env") {
      return { required: true, mode, canRegister: false, username: "admin" };
    }
    const record = mode === "file" ? readPasswordRecord(authFile, logger) : null;
    return {
      required: mode !== "none",
      mode,
      canRegister: mode === "none",
      username: record?.username || null,
    };
  };

  const verifyPassword = (password: string): boolean => {
    const mode = getMode();
    if (mode === "none") return true;
    if (mode === "env") return password === envPassword;
    const record = readPasswordRecord(authFile, logger);
    if (!record) return false;
    const nextHash = hashPassword(password, record.salt);
    return safeHexEquals(record.hash, nextHash);
  };

  const register = ({
    username,
    password,
  }: {
    username: string;
    password: string;
  }): PasswordResult => {
    const snapshot = getSnapshot();
    if (!snapshot.canRegister) {
      return { ok: false, status: 409, error: "Registration has already been completed" };
    }

    const validation = validatePassword(password);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation.error };
    }

    const record = buildRecord({ username: normalizeUsername(username), password });
    return writePasswordRecord(authFile, record);
  };

  const updatePassword = ({
    currentPassword,
    nextPassword,
    username,
  }: {
    currentPassword?: string;
    nextPassword: string;
    username?: string;
  }): PasswordResult => {
    const snapshot = getSnapshot();
    if (snapshot.mode === "env") {
      return {
        ok: false,
        status: 400,
        error: "Password is managed by LOONG_PASSWORD and cannot be changed from Web UI",
      };
    }

    const validation = validatePassword(nextPassword);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation.error };
    }

    const previous = readPasswordRecord(authFile, logger);
    if (snapshot.mode === "file") {
      if (!previous) {
        return { ok: false, status: 500, error: "Auth store is not readable" };
      }
      if (!verifyPassword(currentPassword || "")) {
        return { ok: false, status: 401, error: "Current password is incorrect" };
      }
    }

    const nextRecord = buildRecord({
      username: normalizeUsername(username || previous?.username || "admin"),
      password: nextPassword,
      previous,
    });
    return writePasswordRecord(authFile, nextRecord);
  };

  return {
    getSnapshot,
    verifyPassword,
    register,
    updatePassword,
  };
};
