import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { decryptText, encryptText } from "./crypto";
import { Storage } from "./storage";

const USER_ACCOUNT_KEYS = "userAccountKeys";

export type CSVAccount = {
  accountName: string;
  username: string;
  password: string;
  secretKey: string;
  websiteUrl: string;
  notes: string;
};

export type CSVValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  accounts: CSVAccount[];
};

export type ImportMode = "merge" | "overwrite";

// ─── Our canonical CSV headers (for export) ──────────────────────────────────
const CSV_HEADERS = [
  "accountName",
  "username",
  "password",
  "secretKey",
  "websiteUrl",
  "notes",
];

// ─── Column aliases from popular password managers ───────────────────────────
// Maps any known header variant (lowercased, trimmed) → our internal field name
const COLUMN_ALIASES: Record<string, string> = {
  // accountName
  accountname: "accountName",
  title: "accountName",
  name: "accountName",
  account: "accountName",
  service: "accountName",
  issuer: "accountName",
  label: "accountName",

  // username
  username: "username",
  user: "username",
  email: "username",
  login: "username",
  login_username: "username",
  "user name": "username",

  // password
  password: "password",
  pass: "password",
  login_password: "password",

  // secretKey (OTP / 2FA)
  secretkey: "secretKey",
  secret: "secretKey",
  otpauth: "secretKey",
  otp: "secretKey",
  totp_secret: "secretKey",
  "one-time password": "secretKey",
  "two factor secret": "secretKey",
  totp: "secretKey",
  "authenticator key": "secretKey",

  // websiteUrl
  websiteurl: "websiteUrl",
  url: "websiteUrl",
  website: "websiteUrl",
  uri: "websiteUrl",
  login_uri: "websiteUrl",
  "web site": "websiteUrl",

  // notes
  notes: "notes",
  note: "notes",
  comment: "notes",
  comments: "notes",
  extra: "notes",
};

// ─── Escape a single CSV cell value ──────────────────────────────────────────
const escapeCSVCell = (value: string): string => {
  if (!value) return "";
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

// ─── Parse a single CSV row (handles quoted fields) ──────────────────────────
const parseCSVRow = (row: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
};

// ─── Resolve a raw header string to our internal field name ──────────────────
const resolveHeader = (raw: string): string | null => {
  const normalized = raw.toLowerCase().trim();
  // Direct match on our own headers
  const direct = CSV_HEADERS.find((h) => h.toLowerCase() === normalized);
  if (direct) return direct;
  // Alias lookup
  return COLUMN_ALIASES[normalized] ?? null;
};

// ─── Validate CSV content ─────────────────────────────────────────────────────
export const validateCSV = (csvContent: string): CSVValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const accounts: CSVAccount[] = [];

  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      isValid: false,
      errors: ["CSV file is empty"],
      warnings,
      accounts,
    };
  }

  // Parse and resolve headers
  const rawHeaders = parseCSVRow(lines[0]);
  const resolvedHeaders = rawHeaders.map(resolveHeader);

  // Check that at minimum accountName is resolvable
  if (!resolvedHeaders.includes("accountName")) {
    errors.push(
      `Could not find an account name column.\n` +
        `Expected one of: title, name, accountName, service, issuer.\n` +
        `Found columns: ${rawHeaders.join(", ")}`,
    );
  }

  // Warn about unrecognised columns
  const unknownCols = rawHeaders.filter((_, i) => resolvedHeaders[i] === null);
  if (unknownCols.length > 0) {
    warnings.push(
      `Unrecognized columns will be ignored: ${unknownCols.join(", ")}`,
    );
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings, accounts };
  }

  if (lines.length === 1) {
    warnings.push("CSV file has headers but no account rows.");
    return { isValid: true, errors, warnings, accounts };
  }

  // Build a map: internalFieldName → column index (first match wins)
  const fieldIndex: Record<string, number> = {};
  resolvedHeaders.forEach((field, i) => {
    if (field && !(field in fieldIndex)) {
      fieldIndex[field] = i;
    }
  });

  const get = (cells: string[], field: string): string =>
    field in fieldIndex ? (cells[fieldIndex[field]] ?? "").trim() : "";

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cells = parseCSVRow(lines[i]);

    if (cells.length < rawHeaders.length) {
      warnings.push(
        `Row ${rowNum}: fewer columns than headers — missing fields will be empty`,
      );
    }

    const accountName = get(cells, "accountName");
    const username = get(cells, "username");
    const password = get(cells, "password");
    const secretKey = get(cells, "secretKey");
    const websiteUrl = get(cells, "websiteUrl");
    const notes = get(cells, "notes");

    if (!accountName) {
      errors.push(`Row ${rowNum}: account name is empty, skipping`);
      continue;
    }

    // Validate OTP secret format if provided
    if (secretKey && !secretKey.startsWith("otpauth://")) {
      const clean = secretKey.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z2-7]+=*$/.test(clean)) {
        warnings.push(
          `Row ${rowNum}: "${accountName}" — secretKey may not be a valid Base32 OTP secret`,
        );
      }
    }

    if (!password && !secretKey) {
      warnings.push(
        `Row ${rowNum}: "${accountName}" has no password or OTP secret`,
      );
    }

    accounts.push({
      accountName,
      username,
      password,
      secretKey,
      websiteUrl,
      notes,
    });
  }

  return { isValid: errors.length === 0, errors, warnings, accounts };
};

// ─── Export accounts to CSV ───────────────────────────────────────────────────
export const exportAccountsToCSV = async (): Promise<{
  success: boolean;
  message: string;
  count?: number;
}> => {
  try {
    const keysString = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
    const keys: string[] = keysString ? JSON.parse(keysString) : [];

    if (!keys || keys.length === 0) {
      return { success: false, message: "No accounts to export." };
    }

    const pat = await Storage.getItemAsync("github_token");
    const rows: string[] = [CSV_HEADERS.join(",")];

    for (const key of keys) {
      const raw = await Storage.getItemAsync(key);
      if (!raw) continue;

      const account = JSON.parse(raw);
      const isEncrypted = account.encrypted !== false;

      let plainPassword = "";
      let plainSecret = "";

      if (isEncrypted && pat) {
        try {
          plainPassword = account.password
            ? await decryptText(account.password, pat)
            : "";
        } catch {
          plainPassword = "";
        }
        try {
          plainSecret = account.value
            ? await decryptText(account.value, pat)
            : "";
        } catch {
          plainSecret = "";
        }
      } else {
        plainPassword = account.password || "";
        plainSecret = account.value || "";
      }

      rows.push(
        [
          escapeCSVCell(account.accountName || ""),
          escapeCSVCell(account.username || ""),
          escapeCSVCell(plainPassword),
          escapeCSVCell(plainSecret),
          escapeCSVCell(account.websiteUrl || ""),
          escapeCSVCell(account.notes || ""),
        ].join(","),
      );
    }

    const csvContent = rows.join("\n");
    const fileName = `authfactory_export_${new Date().toISOString().slice(0, 10)}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return {
        success: false,
        message: "Sharing is not available on this device.",
      };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: "text/csv",
      dialogTitle: "Export Accounts CSV",
      UTI: "public.comma-separated-values-text",
    });

    return {
      success: true,
      message: `Exported ${keys.length} accounts.`,
      count: keys.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Export failed." };
  }
};

// ─── Import accounts from CSV ─────────────────────────────────────────────────
export const importAccountsFromCSV = async (
  mode: ImportMode,
): Promise<{
  success: boolean;
  message: string;
  validation?: CSVValidationResult;
  count?: number;
}> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return { success: false, message: "Import cancelled." };
    }

    const file = result.assets[0];
    const csvContent = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const validation = validateCSV(csvContent);

    if (!validation.isValid) {
      return {
        success: false,
        message: `CSV validation failed:\n${validation.errors.join("\n")}`,
        validation,
      };
    }

    if (validation.accounts.length === 0) {
      return {
        success: false,
        message: "No valid accounts found in CSV.",
        validation,
      };
    }

    const pat = await Storage.getItemAsync("github_token");

    if (mode === "overwrite") {
      const existingKeysStr = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
      const existingKeys: string[] = existingKeysStr
        ? JSON.parse(existingKeysStr)
        : [];
      for (const k of existingKeys) await Storage.deleteItemAsync(k);
      await Storage.deleteItemAsync(USER_ACCOUNT_KEYS);
    }

    const existingKeysStr = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
    const existingKeys: string[] = existingKeysStr
      ? JSON.parse(existingKeysStr)
      : [];
    const newKeys: string[] = [...existingKeys];
    const now = new Date().toISOString();

    for (const account of validation.accounts) {
      const accountKey = `account_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      let encryptedPassword = "";
      let encryptedSecret = "";

      if (pat) {
        try {
          encryptedPassword = account.password
            ? await encryptText(account.password, pat)
            : "";
        } catch {
          encryptedPassword = account.password;
        }
        try {
          encryptedSecret = account.secretKey
            ? await encryptText(account.secretKey, pat)
            : "";
        } catch {
          encryptedSecret = account.secretKey;
        }
      } else {
        encryptedPassword = account.password;
        encryptedSecret = account.secretKey;
      }

      await Storage.setItemAsync(
        accountKey,
        JSON.stringify({
          accountName: account.accountName,
          username: account.username,
          password: encryptedPassword,
          value: encryptedSecret,
          websiteUrl: account.websiteUrl,
          notes: account.notes,
          encrypted: !!pat,
          createdAt: now,
          modifiedAt: now,
          isFavorite: false,
        }),
      );

      newKeys.push(accountKey);
      await new Promise((r) => setTimeout(r, 5));
    }

    await Storage.setItemAsync(USER_ACCOUNT_KEYS, JSON.stringify(newKeys));

    return {
      success: true,
      message: `Successfully imported ${validation.accounts.length} account(s).`,
      validation,
      count: validation.accounts.length,
    };
  } catch (err: any) {
    return { success: false, message: err.message || "Import failed." };
  }
};
