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
