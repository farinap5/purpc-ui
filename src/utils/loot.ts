const IMAGE_MIME_TYPES: Record<string, string> = {
  apng: "image/apng",
  arw: "image/x-sony-arw",
  avif: "image/avif",
  bmp: "image/bmp",
  cr2: "image/x-canon-cr2",
  dng: "image/x-adobe-dng",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  ico: "image/x-icon",
  jpe: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  jpg: "image/jpeg",
  nef: "image/x-nikon-nef",
  png: "image/png",
  raw: "image/x-raw",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp"
};

export interface LootContentPreview {
  kind: "text" | "hex";
  content: string;
  bytesShown: number;
  totalBytes: number;
  truncated: boolean;
}

const TEXT_PREVIEW_LIMIT = 64 * 1024;
const HEX_PREVIEW_LIMIT = 8 * 1024;
const TEXT_DETECTION_LIMIT = 8 * 1024;
const HEX_ROW_BYTES = 16;

const SECRET_PATH_PATTERNS = [
  /(?:^|\/)etc\/(?:passwd|master\.passwd|shadow|gshadow)(?:[-.](?:bak|old|backup|save))?$/,
  /(?:^|\/)etc\/(?:sudoers|security\/opasswd|krb5\.keytab)$/,
  /(?:^|\/)etc\/ssh\/ssh_host_(?:rsa|dsa|ecdsa|ed25519)_key$/,
  /(?:^|\/)\.ssh\/(?:id_rsa|id_dsa|id_ecdsa|id_ed25519|authorized_keys)$/,
  /(?:^|\/)\.gnupg\/(?:secring\.gpg|private-keys-v1\.d\/[^/]+\.key)$/,
  /(?:^|\/)\.aws\/(?:credentials|config)$/,
  /(?:^|\/)\.azure\/(?:accesstokens\.json|azureprofile\.json|msal_token_cache\.json)$/,
  /(?:^|\/)\.config\/gcloud\/(?:credentials\.db|access_tokens\.db|application_default_credentials\.json)$/,
  /(?:^|\/)\.kube\/config$/,
  /(?:^|\/)\.docker\/config\.json$/,
  /(?:^|\/)\.config\/gh\/hosts\.yml$/,
  /(?:^|\/)(?:\.git-credentials|\.netrc|\.npmrc|\.pypirc|\.htpasswd)$/,
  /(?:^|\/)(?:\.bash_history|\.zsh_history|\.python_history|\.mysql_history|\.psql_history|fish_history|consolehost_history\.txt)$/,
  /(?:^|\/)var\/run\/secrets\/kubernetes\.io\/serviceaccount\/token$/,
  /(?:^|\/)proc\/\d+\/environ$/,
  /(?:^|\/)windows\/system32\/config\/(?:sam|security|system)$/,
  /(?:^|\/)ntds\/ntds\.dit$/,
  /(?:^|\/)(?:unattend|unattended|sysprep)\.xml$/,
  /(?:^|\/)(?:login data|web data|cookies|key4\.db|logins\.json)$/,
  /(?:^|\/)(?:winscp\.ini|sitemanager\.xml|recentservers\.xml)$/,
  /(?:^|\/)(?:client_secret[^/]*\.json|service[-_]?account[^/]*\.json|credentials\.json)$/,
  /(?:^|\/)(?:terraform\.tfstate(?:\.backup)?|\.terraformrc)$/,
  /(?:^|\/)(?:wp-config\.php|web\.config|database\.yml)$/,
  /\.(?:pem|key|p12|pfx|jks|keystore|kdb|kdbx|psafe3|ovpn)$/
];

const normalizeLootPath = (fileName: string) => (
  fileName
    .split(/[?#]/, 1)[0]
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .toLowerCase()
);

const fileExtension = (fileName: string) => {
  const pathWithoutQuery = normalizeLootPath(fileName);
  const baseName = pathWithoutQuery.slice(pathWithoutQuery.lastIndexOf("/") + 1);
  const separator = baseName.lastIndexOf(".");
  return separator >= 0 ? baseName.slice(separator + 1) : "";
};

const isKnownImageExtension = (extension: string) => (
  Object.prototype.hasOwnProperty.call(IMAGE_MIME_TYPES, extension)
);

export const isImageFileName = (fileName: string) => isKnownImageExtension(fileExtension(fileName));

export const isSecretFileName = (fileName: string) => {
  const path = normalizeLootPath(fileName);
  const isEnvironmentFile = /(?:^|\/)\.env(?:\.[^/]+)?$/.test(path)
    && !/\.(?:example|sample|template|dist)$/.test(path);
  return isEnvironmentFile || SECRET_PATH_PATTERNS.some(pattern => pattern.test(path));
};

export const imageMimeType = (fileName: string) => {
  const extension = fileExtension(fileName);
  return isKnownImageExtension(extension) ? IMAGE_MIME_TYPES[extension] : "application/octet-stream";
};

const probableTextEncoding = (bytes: Uint8Array): "utf-8" | "utf-16le" | "utf-16be" | null => {
  if (bytes.length === 0) return "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";

  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
  }

  const pairCount = Math.max(1, Math.floor(bytes.length / 2));
  if (pairCount >= 4 && oddNulls / pairCount > 0.3 && evenNulls / pairCount < 0.05) return "utf-16le";
  if (pairCount >= 4 && evenNulls / pairCount > 0.3 && oddNulls / pairCount < 0.05) return "utf-16be";
  if (evenNulls + oddNulls > 0) return null;

  const decoded = new TextDecoder("utf-8").decode(bytes);
  let replacementCharacters = 0;
  let controlCharacters = 0;
  for (const character of decoded) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint === 0xfffd) replacementCharacters += 1;
    if ((codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) || codePoint === 0x7f) {
      controlCharacters += 1;
    }
  }
  const characterCount = Math.max(1, decoded.length);
  return replacementCharacters / characterCount <= 0.02 && controlCharacters / characterCount <= 0.02
    ? "utf-8"
    : null;
};

const hexDump = (bytes: Uint8Array) => {
  const rows: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += HEX_ROW_BYTES) {
    const row = bytes.slice(offset, offset + HEX_ROW_BYTES);
    const hexadecimal = Array.from(row, byte => byte.toString(16).padStart(2, "0"));
    const left = hexadecimal.slice(0, 8).join(" ").padEnd(23, " ");
    const right = hexadecimal.slice(8).join(" ").padEnd(23, " ");
    const ascii = Array.from(row, byte => byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".").join("");
    rows.push(`${offset.toString(16).padStart(8, "0")}  ${left}  ${right}  |${ascii.padEnd(HEX_ROW_BYTES, " ")}|`);
  }
  return rows.join("\n");
};

export const createLootContentPreview = async (blob: Blob): Promise<LootContentPreview> => {
  const detectionBytes = new Uint8Array(await blob.slice(0, TEXT_DETECTION_LIMIT).arrayBuffer());
  const encoding = probableTextEncoding(detectionBytes);
  const limit = encoding ? TEXT_PREVIEW_LIMIT : HEX_PREVIEW_LIMIT;
  const previewBytes = new Uint8Array(await blob.slice(0, limit).arrayBuffer());

  return {
    kind: encoding ? "text" : "hex",
    content: encoding
      ? new TextDecoder(encoding).decode(previewBytes).replace(/^\uFEFF/, "")
      : hexDump(previewBytes),
    bytesShown: previewBytes.length,
    totalBytes: blob.size,
    truncated: blob.size > previewBytes.length
  };
};
