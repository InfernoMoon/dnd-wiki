# DnD Wiki

DnD Wiki is an [Obsidian](https://obsidian.md) plugin that turns Markdown code blocks into expandable DnD reference cards. It displays spells, feats, magic items, backgrounds, lineages or species, classes, subclass information, and other wiki content directly inside your notes.

The plugin includes source configurations for both the 2014/5e and 2024 rules. You can add other compatible wiki-style sources in the plugin settings.

## Features

- Display DnD entries as collapsible cards.
- Create complete or filtered lists of spells, feats, items, backgrounds, and lineages.
- Use the included `5e` and `2024` sources or configure your own.
- Display complete class pages, subclasses, and selected page sections.
- Load other wiki pages with the generic `custom` block.
- Get autocomplete for block types, names, and supported filters.
- Add experimental local custom cards to your vault.

## Installation

### Manual installation

1. Create the following folder inside your vault:

   ```text
   <Vault>/.obsidian/plugins/dnd-wiki/
   ```

2. Copy `main.js`, `manifest.json`, and `styles.css` when present into that folder.
3. Restart Obsidian or select **Reload app without saving** from the command palette.
4. Open **Settings → Community plugins** and enable **DnD Wiki**.

### Build from source

Building requires a current Node.js LTS release and npm.

```bash
npm install
npm run build
```

Copy the generated `main.js` and `manifest.json` into `<Vault>/.obsidian/plugins/dnd-wiki/`, then reload Obsidian. Use `npm run dev` for a watch build during development.

## Basics

Every DnD Wiki block follows this pattern:

```text
dnd<version>-<content-type>
```

Two versions are configured by default:

- `5e` uses the DnD 5e source.
- `2024` uses the DnD 2024 source.

The content type determines what is displayed. Examples include `spell`, `spelllist`, `feat`, `magicitem`, `classinfo`, and `custom`:

```text
dnd5e-spell
dnd2024-spelllist
dnd5e-classinfo
```

Individual blocks display named entries:

````markdown
```dnd5e-spell
Fireball
Mage Hand
```
````

````markdown
```dnd2024-spell
Fireball
```
````

List blocks load a collection and apply filters:

````markdown
```dnd5e-spelllist
level: 3
class: Wizard
```
````

````markdown
```dnd2024-spelllist
level: 1
class: Cleric
```
````

Open the note in Reading view or Live Preview, then select a card heading to expand or collapse it.

## Autocomplete

You do not need to remember block names, spell names, or filter options. Start by typing:

````text
```dnd
````

DnD Wiki suggests a version such as `5e` or `2024`, followed by available content types. For example, typing ` ```dnd5e-` suggests `spell`, `spelllist`, `feat`, `magicitem`, and the other registered types.

Inside a block, autocomplete suggests known card names and supported directives. Some free-form values are not suggested, including custom page paths and section names.

## DnD features

### Individual cards

Enter one name or identifier per line. The following individual content types share this behavior:

| Content type | Displays |
|---|---|
| `spell` | Spells |
| `feat` | Feats |
| `magicitem` | Magic items |
| `background` | Backgrounds |
| `lineage` | Lineages, or species for the 2024 source |
| `class` | Complete class pages |

````markdown
```dnd5e-feat
Alert
Lucky
```
````

### Spell lists and filters

A `spelllist` block displays all available spells unless filters are supplied.

| Directive | Purpose | Example |
|---|---|---|
| `level:` | Levels 0–9, comma-separated values, ranges, or `all` | `level: 2-4` |
| `class:` | One or more classes | `class: Wizard, Sorcerer` |
| `school:` | One or more schools | `school: Evocation` |
| `addspells:` | Add spells after filtering | `addspells: Light` |
| `removespells:` | Remove spells from the result | `removespells: Fireball` |
| `search:` | Search names and rendered content | `search: damage` |
| `searchMode:` | Combine searches with `and` or `or` | `searchMode: and` |

Values within one `class:` or `school:` directive are alternatives. Different filter categories are combined. Repeated `search:` directives use `or` by default; use `searchMode: and` to require every term.

````markdown
```dnd5e-spelllist
level: 1-3
class: Wizard
school: Evocation
addspells: Healing Word
```
````

This creates a list of 1st- through 3rd-level Wizard Evocation spells. The character also gained access to Healing Word from another feature, even though it is not normally a Wizard spell, so `addspells:` includes it manually.

### Other lists

| Content type | Filters |
|---|---|
| `featlist` | `search:`, `searchMode:` |
| `backgroundlist` | `search:`, `searchMode:` |
| `lineagelist` | `search:`, `searchMode:` |
| `magicitemlist` | `level:`, `type:`, `attuned:`, `search:`, `searchMode:` |

This displays feats whose names or descriptions mention either Constitution or Strength:

````markdown
```dnd5e-featlist
search: constitution
search: strength
searchMode: or
```
````

Change `searchMode:` to `and` to require both terms.

For magic items, `level:` represents rarity. Supported values are `Common`, `Uncommon`, `Rare`, `Very-Rare`, `Legendary`, `Artifact`, `Unique`, and `Other`. `attuned:` accepts `required`, `not-required`, `true`, `false`, or `all`.

````markdown
```dnd5e-magicitemlist
level: Uncommon, Rare
type: Wondrous Item
attuned: required
search: teleport
```
````

The same repeated `search:` and `searchMode:` behavior used by spell lists also applies to these list blocks.

## Class information

Use `classinfo` to display a subclass or another class-related wiki page. `class:` and the final `subinfo:` value are combined into `{baseUrl}/{class}:{subinfo}`.

A subclass can be displayed directly:

````markdown
```dnd5e-classinfo
class: Fighter
subinfo: Battle Master
```
````

Use `section:` to display one matching heading. Use `sectionFrom:` to display that heading and all following headings at the same level. A `sectionFrom:` range stops at a higher-level heading or the end of the page.

This example displays Warlock invocations beginning with Agonizing Blast:

````markdown
```dnd2024-classinfo
class: Warlock
subinfo: Eldritch Invocation
sectionFrom: Agonizing Blast
```
````

This example displays Blood Hunter mutagens beginning with Aether:

````markdown
```dnd5e-classinfo
class: Blood Hunter
subinfo: Mutant
subinfo: Mutagens
sectionFrom: Aether
```
````

When multiple `subinfo:` lines are present, autocomplete can use the preceding values as a path, while the final value determines the page that is rendered.

You may mix multiple `section:` and `sectionFrom:` directives. Their results are rendered in the order in which they are written. Without either directive, the complete page is displayed.

## Custom wiki pages

Use `custom` for content that exists on the wiki but does not have a dedicated DnD Wiki content type. For example, this displays the weapon-mastery properties table:

````markdown
```dnd2024-custom
source: equipment:weapon
section: Mastery Properties
```
````

The `source:` value is appended directly to the selected base URL, producing `{baseUrl}/equipment:weapon` in this example. Colons and additional path segments are preserved.

Without `section:` or `sectionFrom:`, the complete page is displayed. Both section directives behave exactly as described under **Class information**.

Autocomplete suggests the directive names, but it cannot suggest wiki page paths or section names.

## Local custom cards

> [!WARNING]
> Local custom cards are still experimental. The workflow is somewhat clunky, metadata support is incomplete, and not every card type or field is supported yet.

Select **Add Custom Cards** under **Settings → DnD Wiki** to create example files and these folders:

```text
DnD-Cards/
├── Spells/
├── Feats/
└── Items/
```

`DnD-Cards/Backgrounds/` and `DnD-Cards/Lineages/` can be created manually. A Markdown filename becomes its card name, and a local card overrides a remote card with the same normalized name. Restart Obsidian if new files do not appear in autocomplete or lists.

## Configure sources

Open **Settings → DnD Wiki → Source URLs** to add, rename, or remove wiki sources. The defaults are:

| Key | Base URL |
|---|---|
| `5e` | `url` |
| `2024` | `url` |

The key becomes the version in the block name. A source with the key `homebrew`, for example, provides blocks such as `dndhomebrew-spell`. Use keys made from letters and numbers, and restart Obsidian after changing them.

## Data and privacy

DnD Wiki does not collect telemetry, analytics, usage statistics, vault filenames, or note contents.

The plugin sends network requests only to the source URLs configured under **Settings → DnD Wiki → Source URLs**. It downloads the index and content pages needed to render cards and lists.

Downloaded content is cached only in memory. It is not saved permanently and is discarded when Obsidian or the plugin restarts. The plugin permanently stores only its settings, such as configured source URLs. Local custom cards remain ordinary files in the user's vault.

## Legal notice

DnD Wiki is an unofficial fan-made project. It is not approved, sponsored, or endorsed by Wizards of the Coast.

Dungeons & Dragons, DnD, Wizards of the Coast, and related names, trademarks, rules, artwork, characters, and game materials belong to their respective rights holders, including Wizards of the Coast LLC where applicable. This project does not claim ownership of that material.

The [BSD Zero Clause License](LICENSE) applies only to the plugin's source code. It does not grant rights to remote wiki content, DnD material, user-created cards, or other third-party content.

DnD Wiki retrieves and displays content from sources selected by the user. Source operators and users are responsible for ensuring that their content and use comply with applicable copyright, trademark, licensing, and website terms.

See the official [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy) and [DnD System Reference Document licensing information](https://www.dndbeyond.com/srd).

## Project note

This project is mostly for fun. I created it to make writing my DM and player notes in Obsidian easier and to reference DnD rules directly from those notes.

Most of the code was written with AI assistance, so the code quality may be uneven in places. This is not intended to be a serious production-grade project, but it is fully usable, and I am not currently aware of any bugs.

DnD Wiki depends on the structure of external wikis. If those wikis change, some features may stop working. I intend to fix issues when they arise, but I cannot make any promises.

Thanks for checking it out! :)
