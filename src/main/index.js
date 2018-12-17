"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
// One of my major regrets in life is putting an ! at the end of the application name
// This should allow me to use a sane directory name but not break old installs.
if (fs_extra_1.existsSync(path_1.join(electron_1.app.getPath("appData"), "Doki Doki Mod Manager!"))) {
    console.log("Overriding app data path");
    electron_1.app.setPath("userData", path_1.join(electron_1.app.getPath("appData"), "Doki Doki Mod Manager!"));
}
else {
    electron_1.app.setPath("userData", path_1.join(electron_1.app.getPath("appData"), "DokiDokiModManager"));
}
electron_1.app.setName("Doki Doki Mod Manager!");
const ModList_1 = require("./mod/ModList");
const i18n_1 = require("./utils/i18n");
const InstallList_1 = require("./install/InstallList");
const InstallLauncher_1 = require("./install/InstallLauncher");
const Config_1 = require("./utils/Config");
const InstallCreator_1 = require("./install/InstallCreator");
const ModInstaller_1 = require("./mod/ModInstaller");
const InstallManager_1 = require("./install/InstallManager");
const DiscordManager_1 = require("./discord/DiscordManager");
const DownloadManager_1 = require("./net/DownloadManager");
// region Crash reporting
electron_1.crashReporter.start({
    companyName: "DDMM",
    productName: "DokiDokiModManager",
    ignoreSystemCrashHandler: true,
    extra: {
        "purist_mode": Config_1.default.readConfigValue("puristMode"),
        "install_directory": Config_1.default.readConfigValue("installFolder")
    },
    uploadToServer: true,
    submitURL: "https://sentry.io/api/1297252/minidump/?sentry_key=bf0edf3f287344d4969e3171c33af4ea"
});
// endregion
// region Flags and references
// User agent for API requests
const USER_AGENT = "DokiDokiModManager/" + electron_1.app.getVersion() + " (zudo@doki.space)";
// The last argument, might be a ddmm:// url
const lastArg = process.argv.pop();
// Permanent reference to the main app window
let appWindow;
// Discord rich presence
let richPresence = new DiscordManager_1.default(process.env.DDMM_DISCORD_ID ? process.env.DDMM_DISCORD_ID : "453299645725016074");
richPresence.setIdleStatus();
// Download manager
let downloadManager;
// Flag for allowing the app window to be closed
let windowClosable = true;
const lang = new i18n_1.default(electron_1.app.getLocale());
// endregion
// region IPC functions
function showError(title, body, stacktrace, fatal) {
    appWindow.webContents.send("error message", {
        title, body, fatal, stacktrace
    });
    windowClosable = true;
    appWindow.setClosable(true);
}
function launchInstall(folderName) {
    Config_1.default.saveConfigValue("lastLaunchedInstall", folderName);
    appWindow.minimize(); // minimise the window to draw attention to the fact another window will be appearing
    appWindow.webContents.send("running cover", {
        display: true,
        dismissable: false,
        title: lang.translate("running_cover.running.title"),
        description: lang.translate("running_cover.running.description")
    });
    InstallLauncher_1.default.launchInstall(folderName, richPresence).then(() => {
        appWindow.restore(); // show DDMM again
        appWindow.focus();
        appWindow.webContents.send("running cover", { display: false });
        appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
    }).catch(err => {
        appWindow.restore();
        appWindow.focus();
        appWindow.webContents.send("running cover", {
            display: true,
            dismissable: true,
            title: lang.translate("running_cover.error.title"),
            description: err
        });
    });
}
// Restart the app
electron_1.ipcMain.on("restart", () => {
    electron_1.app.relaunch();
    electron_1.app.quit();
});
// Retrieves a list of mods
electron_1.ipcMain.on("get modlist", () => {
    appWindow.webContents.send("got modlist", ModList_1.default.getModList());
});
// Retrieves a list of installs
electron_1.ipcMain.on("get installs", () => {
    appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
});
// Handler for renderer process localisation functions
electron_1.ipcMain.on("translate", (ev, query) => {
    let passArgs = query.args;
    passArgs.unshift(query.key);
    ev.returnValue = lang.translate.apply(lang, passArgs);
});
// Open external URLs
electron_1.ipcMain.on("open url", (ev, url) => {
    electron_1.shell.openExternal(url);
});
// Show file in file manager
electron_1.ipcMain.on("show file", (ev, path) => {
    electron_1.shell.showItemInFolder(path);
});
// Toggle closeable flag
electron_1.ipcMain.on("closable", (ev, flag) => {
    windowClosable = flag;
    appWindow.setClosable(flag);
});
// Config IPC functions
electron_1.ipcMain.on("save config", (ev, configData) => {
    Config_1.default.saveConfigValue(configData.key, configData.value);
});
electron_1.ipcMain.on("read config", (ev, key) => {
    ev.returnValue = Config_1.default.readConfigValue(key);
});
// Launch install
electron_1.ipcMain.on("launch install", (ev, folderName) => {
    launchInstall(folderName);
});
// Browse for a mod
electron_1.ipcMain.on("browse mods", (ev) => {
    electron_1.dialog.showOpenDialog(appWindow, {
        buttonLabel: lang.translate("mods.browse_dialog.button_label"),
        title: lang.translate("mods.browse_dialog.title"),
        filters: [{
                extensions: ["zip", "gz", "tar", "rar", "7z"],
                name: lang.translate("mods.browse_dialog.file_format_name")
            }],
    }, (filePaths) => {
        ev.returnValue = filePaths;
    });
});
// Trigger install creation
electron_1.ipcMain.on("create install", (ev, install) => {
    windowClosable = false;
    appWindow.setClosable(false);
    InstallCreator_1.default.createInstall(install.folderName, install.installName, install.globalSave).then(() => {
        if (!install.mod) {
            appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
            windowClosable = true;
            appWindow.setClosable(true);
        }
        else {
            ModInstaller_1.default.installMod(install.mod, path_1.join(Config_1.default.readConfigValue("installFolder"), "installs", install.folderName, "install")).then(() => {
                appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
                windowClosable = true;
                appWindow.setClosable(true);
            }).catch((e) => {
                showError(lang.translate("exceptions.mod_install_notification.title"), lang.translate("exceptions.mod_install_notification.body"), e.toString(), false);
            });
        }
    }).catch((e) => {
        showError(lang.translate("exceptions.game_install_notification.title"), lang.translate("exceptions.game_install_notification.body"), e.toString(), false);
    });
});
// Delete an install permanently
electron_1.ipcMain.on("delete install", (ev, folderName) => {
    InstallManager_1.default.deleteInstall(folderName).then(() => {
        appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
    }).catch((e) => {
        showError(lang.translate("exceptions.install_delete_notification.title"), lang.translate("exceptions.install_delete_notification.body"), e.toString(), false);
    });
});
// Delete a save file for an install
electron_1.ipcMain.on("delete save", (ev, folderName) => {
    InstallManager_1.default.deleteSaveData(folderName).then(() => {
        appWindow.webContents.send("got installs", InstallList_1.default.getInstallList());
    }).catch((e) => {
        showError(lang.translate("exceptions.save_delete_notification.title"), lang.translate("exceptions.save_delete_notification.body"), e.toString(), false);
    });
});
// desktop shortcut creation
electron_1.ipcMain.on("create shortcut", (ev, folderName) => {
    if (process.platform !== "win32") {
        electron_1.dialog.showErrorBox("Shortcut creation is only supported on Windows", "Nice try.");
        return;
    }
    electron_1.dialog.showSaveDialog(appWindow, {
        title: lang.translate("mods.shortcut.dialog_title"),
        filters: [
            { name: lang.translate("mods.shortcut.file_format_name"), extensions: ["lnk"] }
        ]
    }, (file) => {
        if (file) {
            console.log("Writing shortcut to " + file);
            if (!electron_1.shell.writeShortcutLink(file, "create", {
                args: "ddmm://launch-install/" + folderName,
                target: process.argv0
            })) {
                showError(lang.translate("mods.shortcut.error_title"), lang.translate("mods.shortcut.error_message"), null, false);
            }
        }
    });
});
// move installation folder
electron_1.ipcMain.on("move install", () => {
    electron_1.dialog.showOpenDialog(appWindow, {
        title: lang.translate("main.move_install.title"),
        properties: ["openDirectory"]
    }, filePaths => {
        if (filePaths && filePaths[0]) {
            appWindow.hide();
            const oldInstallFolder = Config_1.default.readConfigValue("installFolder");
            const newInstallFolder = path_1.join(filePaths[0], "DDMM_GameData");
            fs_extra_1.move(oldInstallFolder, newInstallFolder, { overwrite: false }, e => {
                if (e) {
                    console.log(e);
                    electron_1.dialog.showErrorBox(lang.translate("main.move_install.error_title"), lang.translate("main.move_install.error_description"));
                }
                else {
                    Config_1.default.saveConfigValue("installFolder", newInstallFolder);
                }
                electron_1.app.relaunch();
                electron_1.app.quit();
            });
        }
    });
});
// Get available backgrounds
electron_1.ipcMain.on("get backgrounds", (ev) => {
    ev.returnValue = fs_extra_1.readdirSync(path_1.join(__dirname, "../renderer/images/backgrounds"));
});
// Crash for debugging
electron_1.ipcMain.on("debug crash", () => {
    throw new Error("User forced debug crash with DevTools");
});
// endregion
// region Global exception handler
process.on("uncaughtException", (e) => {
    console.log("Uncaught exception occurred - treating this as a crash.");
    console.error(e);
    showError(lang.translate("exceptions.main_crash_notification.title"), lang.translate("exceptions.main_crash_notification.body"), e.toString(), true);
});
// endregion
// region App initialisation
function handleURL(forcedArg) {
    // logic for handling various command line arguments
    const url = forcedArg ? forcedArg : lastArg;
    if (url.startsWith("ddmm://")) {
        const command = url.split("ddmm://")[1];
        if (command.startsWith("launch-install/")) {
            const installFolder = command.split("launch-install/")[1];
            launchInstall(installFolder);
        }
    }
}
electron_1.app.on("second-instance", (ev, argv) => {
    appWindow.restore();
    appWindow.focus();
    handleURL(argv.pop());
});
electron_1.app.on("ready", () => {
    electron_1.app.setAppUserModelId("space.doki.modmanager");
    if (!electron_1.app.requestSingleInstanceLock()) {
        // we should quit, as another instance is running
        console.log("App already running.");
        electron_1.app.quit();
        return; // avoid running for longer than needed
    }
    if (!fs_extra_1.existsSync(path_1.join(Config_1.default.readConfigValue("installFolder"), "mods")) ||
        !fs_extra_1.existsSync(path_1.join(Config_1.default.readConfigValue("installFolder"), "installs"))) {
        console.log("Creating directory structure");
        fs_extra_1.mkdirpSync(path_1.join(Config_1.default.readConfigValue("installFolder"), "mods"));
        fs_extra_1.mkdirpSync(path_1.join(Config_1.default.readConfigValue("installFolder"), "installs"));
    }
    electron_1.app.setAsDefaultProtocolClient("ddmm");
    // create browser window
    appWindow = new electron_1.BrowserWindow({
        title: "Doki Doki Mod Manager",
        width: 1024,
        height: 600,
        minWidth: 1000,
        minHeight: 600,
        maximizable: true,
        frame: false,
        webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            preload: path_1.join(__dirname, "../renderer/js-preload/preload.js") // contains all the IPC scripts
        },
        titleBarStyle: "hiddenInset",
        show: false
    });
    // Activate download manager
    downloadManager = new DownloadManager_1.default(appWindow);
    // TODO: implement this as an actual feature
    // DDLCDownloader.getDownloadLink().then(link => {
    //     downloadManager.downloadFile(link, "C:\\DDMM\\ddlc.zip");
    // });
    // set user agent so web services can contact me if necessary
    appWindow.webContents.setUserAgent(USER_AGENT);
    appWindow.webContents.on("will-navigate", ev => {
        console.warn("Prevented navigation from app container");
        ev.preventDefault(); // prevent navigation
    });
    appWindow.webContents.on("did-finish-load", () => {
        if (!appWindow.isVisible()) {
            appWindow.show();
        }
    });
    appWindow.on("close", (ev) => {
        if (!windowClosable) {
            ev.preventDefault();
        }
    });
    appWindow.webContents.on("crashed", () => {
        const crashNotif = new electron_1.Notification({
            title: lang.translate("exceptions.renderer_crash_notification.title"),
            body: lang.translate("exceptions.renderer_crash_notification.body"),
        });
        crashNotif.show();
        electron_1.app.quit();
    });
    appWindow.on("unresponsive", () => {
        const freezeNotif = new electron_1.Notification({
            title: lang.translate("exceptions.renderer_freeze_notification.title"),
            body: lang.translate("exceptions.renderer_freeze_notification.body"),
        });
        freezeNotif.show();
    });
    appWindow.on("closed", () => {
        appWindow = null;
        electron_1.app.quit();
    });
    appWindow.on("ready-to-show", () => {
        handleURL();
    });
    appWindow.setMenu(null);
    if (process.env.DDMM_DEVTOOLS) {
        appWindow.webContents.openDevTools({ mode: "detach" });
    }
    appWindow.loadFile(path_1.join(__dirname, "../renderer/html/index.html"));
});
// endregion
//# sourceMappingURL=index.js.map