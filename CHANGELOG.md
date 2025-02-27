## [0.2.2] - 2025-01-08
### Added
- Added the execution time of the `findTranslationItem` command in the success notification in milliseconds

### Fixed
- Fixed an issue where the word “translations” in the success notification was still plural when only 1 translation was found

## [0.2.1] - 2025-01-04
### Fixed
- Fixed an issue with the `findTranslationItem` command where translation keys wouldn't automatically be detected when the translation hook was on a different line than the translation key

## [0.2.0] - 2024-12-30
### Added
- Added a new setting to set in which order language files should be opened. If the order of the languages is not set, it will be opened in alphabetical order (e.g. de, en, nl)
- Added a more advanced and performant search algorithm for `findTranslationItem` to find translation items based on the translation key

## [0.0.5] - 2024-07-23
### Fixed
- Fixed an issue where a filename would be seen as a language folder name

## [0.0.2] - 2024-07-11
### Added
- Added command "findTranslationItem" (Experimental)

## [0.0.1] - 2024-07-02
### Initial release
