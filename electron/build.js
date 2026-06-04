const builder = require("electron-builder")
const fs = require("fs")
const path = require("path")
const { normalizeBundledMacChromiumForPackaging } = require("./scripts/prepare-export-chromium.cjs")

const APP_ID = "com.presenton.presenton"
const TEAM_ID = "S6W5C54KL6"
const macTarget = process.env.PRESENTON_MAC_TARGET

function getResourcesRoot(context) {
  if (context.electronPlatformName === "darwin") {
    const appBundleName = `${context.packager.appInfo.productFilename}.app`
    return path.join(
      context.appOutDir,
      appBundleName,
      "Contents",
      "Resources",
      "app",
      "resources"
    )
  }

  return path.join(context.appOutDir, "resources", "app", "resources")
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function chmodExecutableIfPresent(filePath) {
  if (fs.existsSync(filePath) && process.platform !== "win32") {
    fs.chmodSync(filePath, 0o755)
  }
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} missing at ${filePath}`)
  }
}

function assertManifestRuntime(rootDir, manifestName, label) {
  const manifestPath = path.join(rootDir, manifestName)
  assertFile(manifestPath, `${label} manifest`)
  const manifest = readJson(manifestPath)
  const executable = manifest.executable || manifest.binary
  if (!executable) {
    throw new Error(`${label} manifest does not declare executable/binary: ${manifestPath}`)
  }

  const executablePath = path.join(rootDir, executable)
  assertFile(executablePath, `${label} executable`)
  chmodExecutableIfPresent(executablePath)
  return executablePath
}

function setExecutablePermissions(resourcesRoot, platform, arch) {
  const fastapiBinary = platform === "win32" ? "fastapi.exe" : "fastapi"
  const fastapiPath = path.join(resourcesRoot, "fastapi", fastapiBinary)
  const exportPyDir = path.join(resourcesRoot, "export", "py")
  const exeSuffix = platform === "win32" ? ".exe" : ""
  const converterCandidates = [
    `convert-${platform}-${arch}${exeSuffix}`,
    `convert-${platform}${exeSuffix}`,
    `convert${exeSuffix}`,
  ]

  chmodExecutableIfPresent(fastapiPath)
  for (const candidate of converterCandidates) {
    chmodExecutableIfPresent(path.join(exportPyDir, candidate))
  }
}

function validateBundledRuntimes(resourcesRoot, platform, arch) {
  assertManifestRuntime(
    path.join(resourcesRoot, "chromium"),
    "presenton-runtime.json",
    "Chromium runtime"
  )
  assertManifestRuntime(
    path.join(resourcesRoot, "imagemagick", `${platform}-${arch}`),
    "presenton-runtime.json",
    "ImageMagick runtime"
  )
}

function getTargetArch(context) {
  const arch = builder.Arch?.[context.arch]
  if (arch && arch !== "universal") {
    return arch
  }
  return process.arch
}

const beforePack = async (context) => {
  if (context.electronPlatformName !== "darwin") {
    return
  }

  normalizeBundledMacChromiumForPackaging(path.join(__dirname, "resources", "chromium"))
}

const afterPack = async (context) => {
  const platform = context.electronPlatformName
  const arch = getTargetArch(context)
  const resourcesRoot = getResourcesRoot(context)

  console.log("Validating packaged native runtimes in:", resourcesRoot)
  setExecutablePermissions(resourcesRoot, platform, arch)
  validateBundledRuntimes(resourcesRoot, platform, arch)
}

const config = {
  appId: APP_ID,
  productName: "Presenton",
  asar: false,
  copyright: "Copyright © 2026 Presenton",
  directories: {
    output: "dist",
    buildResources: "build",
  },
  files: [
    "resources",
    "app_dist",
    "node_modules",
    "NOTICE"
  ],
  beforePack,
  afterPack,
  mac: {
    artifactName: "Presenton-${version}.${ext}",
    target: [macTarget || "dmg"],
    category: "public.app-category.productivity",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    icon: "resources/ui/assets/images/presenton_short_filled.png",
    extendInfo: {
      ElectronTeamID: TEAM_ID,
    },
  },
  masDev: {
    type: "development",
    provisioningProfile: "build/AppleDevelopment.provisionprofile",
    entitlements: "build/entitlements.mas.plist",
    entitlementsInherit: "build/entitlements.mas.inherit.plist",
  },
  linux: {
    artifactName: "Presenton-${version}.${ext}",
    target: ["AppImage", "deb"],
    icon: "build/icons",
  },
  deb: {
    afterInstall: "build/after-install.tpl",
    recommends: ["libreoffice"],
  },
  win: {
    target: ["nsis", "appx"],
    icon: "build/icon.ico",
    artifactName: "Presenton-${version}.${ext}",
    executableName: "Presenton",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    installerIcon: "build/icon.ico",
    uninstallerIcon: "build/icon.ico",
    installerHeaderIcon: "build/icon.ico",
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Presenton",
    uninstallDisplayName: "Presenton",
  },
  appx: {
    identityName: "PresentonAI.Presenton",
    publisher: "CN=8A2C57B5-F1C6-473A-93EE-2E9B72134341",
    displayName: "Presenton",
    publisherDisplayName: "Presenton Inc.",
    applicationId: "PresentonAI.Presenton",
  },
}

const targets = macTarget ? builder.Platform.MAC.createTarget([macTarget]) : undefined

builder.build({ targets, config })
