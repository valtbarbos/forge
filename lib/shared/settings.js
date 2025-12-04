/*
 * This file is part of the Forge Window Manager extension for Gnome 3
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Gnome imports
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

import { Logger } from "./logger.js";

// Dev or Prod mode, see Makefile:debug
export const production = true;

export class ConfigManager extends GObject.Object {
  static {
    GObject.registerClass(this);
  }

  #confDir = GLib.get_user_config_dir();

  constructor({ dir }) {
    super();
    this.extensionPath = dir.get_path();
  }

  get confDir() {
    return `${this.#confDir}/forge`;
  }

  get defaultStylesheetFile() {
    const defaultStylesheet = GLib.build_filenamev([this.extensionPath, `stylesheet.css`]);

    Logger.trace(`default-stylesheet: ${defaultStylesheet}`);

    const defaultStylesheetFile = Gio.File.new_for_path(defaultStylesheet);
    if (defaultStylesheetFile.query_exists(null)) {
      return defaultStylesheetFile;
    }
    return null;
  }

  get stylesheetFile() {
    const profileSettingPath = `${this.confDir}/stylesheet/forge`;
    const settingFile = "stylesheet.css";
    const defaultSettingFile = this.defaultStylesheetFile;
    return this.loadFile(profileSettingPath, settingFile, defaultSettingFile);
  }

  get defaultWindowConfigFile() {
    const defaultWindowConfig = GLib.build_filenamev([
      this.extensionPath,
      `config`,
      `windows.json`,
    ]);

    Logger.trace(`default-window-config: ${defaultWindowConfig}`);
    const defaultWindowConfigFile = Gio.File.new_for_path(defaultWindowConfig);

    if (defaultWindowConfigFile.query_exists(null)) {
      return defaultWindowConfigFile;
    }
    return null;
  }

  loadDefaultWindowConfigContents() {
    const defaultSettingFile = this.defaultWindowConfigFile;
    if (defaultSettingFile) {
      const contents = this.loadFileContents(defaultSettingFile);
      if (contents) {
        return JSON.parse(contents);
      }
    }
    return null;
  }

  get windowConfigFile() {
    const profileSettingPath = `${this.confDir}/config`;
    const settingFile = "windows.json";
    const defaultSettingFile = this.defaultWindowConfigFile;
    return this.loadFile(profileSettingPath, settingFile, defaultSettingFile);
  }

  loadFile(path, file, defaultFile) {
    const customSetting = GLib.build_filenamev([path, file]);
    Logger.trace(`custom-setting-file: ${customSetting}`);

    const customSettingFile = Gio.File.new_for_path(customSetting);
    if (customSettingFile.query_exists(null)) {
      return customSettingFile;
    }

    // Handle no-default case (e.g., layout.json)
    if (!defaultFile) {
      const profileCustomSettingDir = Gio.File.new_for_path(path);
      if (!profileCustomSettingDir.query_exists(null)) {
        profileCustomSettingDir.make_directory_with_parents(null);
      }
      // Callers that passed defaultFile = null must handle creation themselves
      return null;
    }

    const profileCustomSettingDir = Gio.File.new_for_path(path);
    if (!profileCustomSettingDir.query_exists(null)) {
      if (profileCustomSettingDir.make_directory_with_parents(null)) {
        const createdStream = customSettingFile.create(Gio.FileCreateFlags.NONE, null);
        const defaultContents = this.loadFileContents(defaultFile);
        Logger.trace(defaultContents);
        createdStream.write_all(defaultContents, null);
      }
    }

    return null;
  }

  loadFileContents(configFile) {
    let [success, contents] = configFile.load_contents(null);
    if (success) {
      const stringContents = imports.byteArray.toString(contents);
      return stringContents;
    }
  }

  get windowProps() {
    let windowConfigFile = this.windowConfigFile;
    let windowProps = null;
    // if (!windowConfigFile || !production) {
    if (!windowConfigFile) {
      windowConfigFile = this.defaultWindowConfigFile;
    }

    let [success, contents] = windowConfigFile.load_contents(null);
    if (success) {
      const windowConfigContents = imports.byteArray.toString(contents);
      Logger.trace(`${windowConfigContents}`);
      windowProps = JSON.parse(windowConfigContents);
    }
    return windowProps;
  }

  set windowProps(props) {
    let windowConfigFile = this.windowConfigFile;
    // if (!windowConfigFile || !production) {
    if (!windowConfigFile) {
      windowConfigFile = this.defaultWindowConfigFile;
    }

    let windowConfigContents = JSON.stringify(props, null, 4);

    const PERMISSIONS_MODE = 0o744;

    if (GLib.mkdir_with_parents(windowConfigFile.get_parent().get_path(), PERMISSIONS_MODE) === 0) {
      let [_, _tag] = windowConfigFile.replace_contents(
        windowConfigContents,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
    }
  }

  get layoutConfigFile() {
    const profileSettingPath = `${this.confDir}/config`;
    const settingFile = "layout.json";
    const fullPath = GLib.build_filenamev([profileSettingPath, settingFile]);

    const layoutFile = Gio.File.new_for_path(fullPath);
    if (layoutFile.query_exists(null)) {
      return layoutFile;
    }

    return null;
  }

  get layoutProps() {
    const layoutFile = this.layoutConfigFile;
    if (!layoutFile) return null;

    let [success, contents] = layoutFile.load_contents(null);
    if (!success) return null;

    try {
      const json = imports.byteArray.toString(contents);
      Logger.debug(`Reading layout snapshot from ${layoutFile.get_path()}, size=${contents.length} bytes`);
      return JSON.parse(json);
    } catch (e) {
      const path = layoutFile.get_path();
      Logger.error(`Failed to parse layout.json at ${path}: ${e.message}`);

      // Quarantine corrupted file so we don't keep hitting the same error
      try {
        const timestamp = Date.now();
        const brokenPath = `${path}.broken-${timestamp}`;
        const brokenFile = Gio.File.new_for_path(brokenPath);
        layoutFile.move(brokenFile, Gio.FileCopyFlags.NONE, null, null);
        Logger.info(`Corrupted layout.json moved to ${brokenPath}`);
      } catch (moveError) {
        Logger.error(`Failed to quarantine corrupted layout.json: ${moveError.message}`);
      }

      return null;
    }
  }

  set layoutProps(snapshot) {
    try {
      let layoutFile = this.layoutConfigFile;
      if (!layoutFile) {
        const profileSettingPath = `${this.confDir}/config`;
        const settingFile = "layout.json";
        // Create the directory if it doesn't exist and initialize the file
        const customSetting = GLib.build_filenamev([profileSettingPath, settingFile]);
        layoutFile = Gio.File.new_for_path(customSetting);

        const profileCustomSettingDir = Gio.File.new_for_path(profileSettingPath);
        if (!profileCustomSettingDir.query_exists(null)) {
          profileCustomSettingDir.make_directory_with_parents(null);
        }
      }

      if (!layoutFile) {
        Logger.error("layoutProps: could not create layout file handle");
        return;
      }

      const snapshotContents = JSON.stringify(snapshot, null, 2);
      const parentPath = layoutFile.get_parent()?.get_path();
      if (!parentPath) {
        Logger.error("layoutProps: could not determine parent directory for layout.json");
        return;
      }

      const PERMISSIONS_MODE = 0o744;

      if (GLib.mkdir_with_parents(parentPath, PERMISSIONS_MODE) === 0) {
        layoutFile.replace_contents(
          snapshotContents,
          null,
          false,
          Gio.FileCreateFlags.REPLACE_DESTINATION,
          null
        );
      } else {
        Logger.error(`layoutProps: failed to create directory ${parentPath}`);
      }
    } catch (e) {
      Logger.error(`layoutProps: failed to write layout.json: ${e.message}`);
      throw e;
    }
  }

  /**
   * Validate layout snapshot structure
   * @param {Object} snapshot - The snapshot to validate
   * @returns {boolean} True if snapshot is valid
   */
  static isValidLayoutSnapshot(snapshot) {
    return (
      snapshot &&
      typeof snapshot.version === "number" &&
      Array.isArray(snapshot.monitors)
    );
  }

  /**
   * Validate tree state structure
   * @param {Object} treeState - The tree state to validate
   * @returns {boolean} True if tree state is valid
   */
  static isValidTreeState(treeState) {
    return (
      treeState &&
      typeof treeState.version === "number" &&
      treeState.root !== undefined
    );
  }

  get treeConfigFile() {
    const profileSettingPath = `${this.confDir}/config`;
    const settingFile = "tree.json";
    const fullPath = GLib.build_filenamev([profileSettingPath, settingFile]);

    const treeFile = Gio.File.new_for_path(fullPath);
    if (treeFile.query_exists(null)) {
      return treeFile;
    }

    return null;
  }

  get treeState() {
    const treeFile = this.treeConfigFile;
    if (!treeFile) return null;

    let [success, contents] = treeFile.load_contents(null);
    if (!success) return null;

    try {
      const json = imports.byteArray.toString(contents);
      Logger.debug(`Reading tree state from ${treeFile.get_path()}, size=${contents.length} bytes`);
      return JSON.parse(json);
    } catch (e) {
      const path = treeFile.get_path();
      Logger.error(`Failed to parse tree.json at ${path}: ${e.message}`);

      // Quarantine corrupted file so we don't keep hitting the same error
      try {
        const timestamp = Date.now();
        const brokenPath = `${path}.broken-${timestamp}`;
        const brokenFile = Gio.File.new_for_path(brokenPath);
        treeFile.move(brokenFile, Gio.FileCopyFlags.NONE, null, null);
        Logger.info(`Corrupted tree.json moved to ${brokenPath}`);
      } catch (moveError) {
        Logger.error(`Failed to quarantine corrupted tree.json: ${moveError.message}`);
      }

      return null;
    }
  }

  set treeState(state) {
    try {
      let treeFile = this.treeConfigFile;
      if (!treeFile) {
        const profileSettingPath = `${this.confDir}/config`;
        const settingFile = "tree.json";
        const customSetting = GLib.build_filenamev([profileSettingPath, settingFile]);
        treeFile = Gio.File.new_for_path(customSetting);

        const profileCustomSettingDir = Gio.File.new_for_path(profileSettingPath);
        if (!profileCustomSettingDir.query_exists(null)) {
          profileCustomSettingDir.make_directory_with_parents(null);
        }
      }

      if (!treeFile) {
        Logger.error("treeState: could not create tree file handle");
        return;
      }

      const stateContents = JSON.stringify(state, null, 2);
      const parentPath = treeFile.get_parent()?.get_path();
      if (!parentPath) {
        Logger.error("treeState: could not determine parent directory for tree.json");
        return;
      }

      const PERMISSIONS_MODE = 0o744;

      if (GLib.mkdir_with_parents(parentPath, PERMISSIONS_MODE) === 0) {
        treeFile.replace_contents(
          stateContents,
          null,
          false,
          Gio.FileCreateFlags.REPLACE_DESTINATION,
          null
        );
      } else {
        Logger.error(`treeState: failed to create directory ${parentPath}`);
      }
    } catch (e) {
      Logger.error(`treeState: failed to write tree.json: ${e.message}`);
      throw e;
    }
  }
}
