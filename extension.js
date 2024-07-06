const vscode = require("vscode");
const path = require("node:path");
const fs = require("node:fs/promises");

/**
 * @param {vscode.ExtensionContext} context
 */

function activate(context) {
	const disposable = vscode.commands.registerCommand(
		"i18n-tools.openAllLanguageVariants",
		async (uri) => {
			if (!uri || !uri.fsPath) {
				vscode.window.showErrorMessage("No file selected");
				return;
			}

			const filePath = uri.fsPath;
			const parts = filePath.split(path.sep);
			const i18nIndex = parts.lastIndexOf("i18n");

			if (i18nIndex === -1) {
				vscode.window.showErrorMessage("Not an i18n file");
				return;
			}

			const basePath = parts.slice(0, i18nIndex + 1).join(path.sep);
			const relativePath = parts.slice(i18nIndex + 2).join(path.sep);

			try {
				const languageFolders = await fs.readdir(basePath);
				const languageFiles = [];

				for (const folder of languageFolders) {
					const fullPath = path.join(basePath, folder, relativePath);
					try {
						await fs.access(fullPath);
						languageFiles.push(fullPath);
					} catch (error) {
						// File doesn't exist, skip
					}
				}

				if (languageFiles.length === 0) {
					vscode.window.showInformationMessage("No corresponding language files found");
					return;
				}

				// Open each language file
				for (const file of languageFiles) {
					const fileUri = vscode.Uri.file(file);
					const doc = await vscode.workspace.openTextDocument(fileUri);
					await vscode.window.showTextDocument(doc, {
						preview: false,
					});
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error: ${error.message}`);
			}
		},
	);

	context.subscriptions.push(disposable);
}

module.exports = {
	activate,
};
