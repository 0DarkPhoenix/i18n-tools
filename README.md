# i18n-tools

## Overview

The "i18n-tools" extension for Visual Studio Code enhances the process of working with internationalization (i18n) files. It provides a convenient way to open all language variants of a selected i18n file, making it easier to manage and edit translations across different languages.

## Features

- **Open All Language Variants**: Quickly open all corresponding language files for a selected i18n file.

## Usage

1. **Open All Language Variants**:
    - Right-click on any i18n file (e.g., JSON, JS, TS, JSX, TSX) in the Explorer or in the editor title context menu.
    - Select the `i18n Tools: Open All Language Variants` command.
    - The extension will automatically open all corresponding language files in new editor tabs.

## Extension Settings

This extension does not contribute any settings.

## Commands

This extension contributes the following command:

- `i18n-tools.openAllLanguageVariants`: Opens all corresponding language files for a selected i18n file.

## Context Menu Integration

The command `i18n-tools.openAllLanguageVariants` is available in the following context menus:

- **Explorer Context Menu**: Available when right-clicking on a file in the Explorer that matches the pattern `i18n/*.(json|js|ts|jsx|tsx)`.
- **Editor Title Context Menu**: Available when right-clicking on the title of an open editor that matches the pattern `i18n/*.(json|js|ts|jsx|tsx)`.

## Known Issues

- Ensure the selected file is within an `i18n` directory and has a supported file extension (JSON, JS, TS, JSX, TSX) to use the `Open All Language Variants` command.
