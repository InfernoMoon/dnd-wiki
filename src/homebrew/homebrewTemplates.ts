import { Vault } from 'obsidian';
import { DEFAULT_HOMEBREW_FOLDER } from '../dataService';

export const HOMEBREW_CATEGORIES = ['Spells', 'Feats', 'Backgrounds', 'Lineages', 'Magic Items'] as const;

export interface HomebrewFolderResult {
	rootPath: string;
	createdPaths: string[];
	createdFiles: string[];
}

function normalizeFolderPath(folderPath: string): string {
	return folderPath.trim().replace(/^\/+|\/+$/g, '') || DEFAULT_HOMEBREW_FOLDER;
}

async function ensureFolder(vault: Vault, folderPath: string, createdPaths: string[]): Promise<void> {
	const segments = folderPath.split('/').filter(Boolean);
	let currentPath = '';

	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		if (vault.getAbstractFileByPath(currentPath)) continue;
		await vault.createFolder(currentPath);
		createdPaths.push(currentPath);
	}
}

async function createHomebrewFolderStructure(
	vault: Vault,
	rootPath: string,
	createdPaths: string[],
): Promise<void> {
	await ensureFolder(vault, rootPath, createdPaths);
	for (const category of HOMEBREW_CATEGORIES) {
		await ensureFolder(vault, `${rootPath}/${category}`, createdPaths);
	}
}

export interface HomebrewFolderStructureResult {
	rootPath: string;
	createdPaths: string[];
}

export async function ensureHomebrewFolderStructure(
	vault: Vault,
	folderPath: string,
): Promise<HomebrewFolderStructureResult> {
	const rootPath = normalizeFolderPath(folderPath);
	const createdPaths: string[] = [];
	await createHomebrewFolderStructure(vault, rootPath, createdPaths);
	return { rootPath, createdPaths };
}

async function createHomebrewTemplateFiles(
	vault: Vault,
	rootPath: string,
	createdFiles: string[],
): Promise<void> {
	const templates: Array<{ path: string; content: string }> = [
		{
			path: `${rootPath}/Spells/_Snowball.md`,
			content: `---
tags:
  - dndwiki/spell
spell-level-dndwiki: 3
class-dndwiki:
  - Sorcerer
  - Wizard
school-dndwiki: Evocation
range-dndwiki: 150 feet
casting-time-dndwiki: Action
components-dndwiki: V, S, M (a small amount of snow)
duration-dndwiki: Instantaneous
---
You form a snowball in your hand and throw it at a point you choose within range. The snowball travels with **remarkable speed** and, upon reaching the chosen point, **explodes into a tiny amount of snow**.

Each creature in a 5-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking **1d4 Cold damage** on a failed save or half as much damage on a successful one.

Flammable objects in the area that aren’t being worn or carried become **covered in a light dusting of snow**.

**Using a Higher-Level Spell Slot.** The snowball increases in size by **1d4 inches** for each spell slot level above 3.
`,
		},
		{
			path: `${rootPath}/Magic Items/_Moveable Rod.md`,
			content: `---
tags:
  - dndwiki/item
item-level-dndwiki: Uncommon
item-type-dndwiki: Rod
requires-attunement: false
---
This iron rod has a button on one end. You can take a Utilize action to press the button, which causes the rod to become magically fixed in place. Until you or another creature takes a Utilize action to push the button again, the rod **continues moving at a normal walking pace in a direction of your choice**.

The rod can carry up to 8,000 pounds of weight while moving. More weight causes the rod to **slow down**.

A creature can take a Utilize action to make a DC 5 Strength (Athletics) check, causing the rod to stop for 1 minute on a successful check.

**Moving.** The rod is not actually moving unless someone is looking at it.
				`,
		},
		{
			path: `${rootPath}/Backgrounds/_Shelf.md`,
			content: `---
tags:
  - dndwiki/background
---
_**Shelves are a magical things of otherworldly utility, living in places of practical beauty, in the midst of ancient libraries or in towering cupboards glittering with polished wood, where the soft creak of floorboards drifts through the air and the gentle fragrance of old books wafts on the breeze. Shelves love storage and organization, books and decoration, and keeping things exactly where someone left them.**_

- **Ability Score Increase.** Your Dexterity score decreases by 2.

- **Age.** Although shelves are assembled at about the same age as other furniture, a shelf's understanding of adulthood goes beyond simply being put together. A shelf typically considers itself mature once it has survived being moved at least three times and can live for several hundred years if properly maintained.

- **Alignment.** Shelves love order, stability, and having things put in their proper place, so they lean strongly towards the gentler aspects of law. They value and protect their own position as well as the things placed upon them, and are orderly more often than not. Racks are an exception; their prolonged exposure to clutter has made them vicious and dangerous.

- **Size.** Shelves range from under 2 to over 6 feet wide and have sturdy builds. Your size is Medium.

- **Speed.** Your base walking speed is 0 feet.

- **Darkvision.** Accustomed to dim cupboards, dusty attics, and poorly lit libraries, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were bright light. You can't discern color in darkness, only shades of gray.

- **Furniture Ancestry.** You have advantage on saving throws against being knocked prone, and magic can't put you to sleep.

- **Trance.** Shelves do not sleep. Instead, they remain completely motionless for 24 hours a day. The Common word for this state is "being a shelf." While remaining motionless, you are completely unaware of your surroundings. After resting in this way, you gain the same benefit a human would from 8 hours of sleep.

- **Keen Storage.** You have proficiency in the Investigation skill.

- **Languages.** You can speak, read, and write Common and Shelf.

## Dark Shelf

_**Descended from an earlier style of shelf, dark shelves were banished from brightly lit rooms for being too gloomy and inconvenient to see into. Now they have built their own civilization in the depths of basements, closets, and abandoned storage rooms, patterned after the ancient Way of Dust. Also called racks. The Racks have black or extremely dark wood that resembles polished obsidian and are commonly covered in a thick layer of dust. They tend to be smaller and thinner than most shelves.**_

- **Ability Score Increase.** Your Constitution score increases by 1.

- **Superior Darkvision.** Your darkvision has a range of 120 feet, instead of 60.

- **Sunlight Sensitivity.** You have disadvantage on attack rolls and Wisdom (Perception) checks that rely on sight when you, the target of the attack, or whatever you are trying to perceive is in direct sunlight.

- Rack Magic.** You know the _Dancing Lights_ cantrip. When you reach 3rd level, you can cast the _Faerie Fire_ spell once with this trait and regain the ability to do so when you finish a long rest. When you reach 5th level, you can cast the _Darkness_ spell once and regain the ability to do so when you finish a long rest. Charisma is your spellcasting ability for these spells.

- **Shelf Weapon Training.** You have proficiency with rapiers, shortswords, and hand crossbows. You have no idea why.

## High Shelf

_**As a high shelf, you have a keen mind and a mastery of at least the basics of organization. High shelves are considered by many to be the finest shelves ever constructed. One type is haughty and reclusive, believing themselves to be superior to lower shelves and even other high shelves. The other type is more common and friendly, and often encountered among humans and other furniture.**_

_**High shelves are usually mounted several feet above the ground, making them difficult for shorter creatures to reach. Their surfaces are commonly decorated with books, trophies, ornaments, and objects that nobody remembers putting there.**_

- **Ability Score Increase.** Your Superiority score increases by 1.

- **Cantrip.** You know one cantrip of your choice from the Wizard spell list. Intelligence is your spellcasting ability for it.

- **Shelf Weapon Training.** You have proficiency with the longsword, shortsword, shortbow, and longbow.

- **Extra Language.** You can read, speak, and write one additional language of your choice from a book that has been placed on you.

## Wood Shelf

_**As a wood shelf, you have keen senses and intuition, and your sturdy construction carries you reliably through your native homes. This category includes oak shelves, pine shelves, walnut shelves, and the shelves sometimes called "real shelves" by people who dislike metal furniture. Wood shelves are reclusive and distrustful of non-wooden furniture.**_

_**Wood shelves' surfaces tend to be brownish in hue, sometimes with traces of green. Their grain tends toward straight lines and knots, but various patterns are not uncommon. Their eyes are usually small screws, nails, or decorative holes.**_

- **Ability Score Increase.** Your Wisdom score increases by 1.

- **Shelf Weapon Training.** You have proficiency with the longsword, shortsword, shortbow, and longbow.

- **Fleet of Foot.** Your base walking speed increases to 5 feet.
    
- **Mask of the Wild.** You can attempt to hide even when you are only lightly obscured by furniture, books, boxes, curtains, and other household objects.
				`,
		},
		{
			path: `${rootPath}/Feats/_Unlucky.md`,
			content: `---
tags:
  - dndwiki/feat
---
You gain the following benefits.

**Unlucky Points.** You have a number of Unlucky Points equal to your Proficiency Bonus and can spend the points on the benefits below. You regain your expended Unlucky Points when you finish a Long Rest.

**Disadvantage.** When you roll a d20 for a D20 Test, you can spend 1 Unlucky Point to give yourself **Disadvantage** on the roll.

**Advantage.** When a creature rolls a d20 for an attack roll against you, you can spend 1 Unlucky Point to give that creature **Advantage** on the roll.
`,
		},
		{
			path: `${rootPath}/Lineages/_Folk Villain.md`,
			content: `---
tags:
  - dndwiki/lineage
---
**You come from an arrogant social rank, and you believe you were destined for exactly that. The people of your home village once regarded you as a useless chump, and your destiny calls you to rise above the common folk, crush those who stand against you, and take your rightful place among the tyrants and monsters who rule the world.**

**Skill Proficiencies:** Animal Handling, Survival
**Tool Proficiencies:** One type of artisan's tools, vehicles (land)  
**Languages:** None  
**Equipment:** A set of artisan's tools (one of your choice), a shovel, an iron pot, a set of common clothes, and a pouch containing 10 gp

## Features

### Defining Event

You previously pursued a simple profession among the peasantry, perhaps as a farmer, miner, servant, shepherd, woodcutter, or gravedigger. But something happened that set you on a different path and convinced you that the common folk were beneath you. Choose or randomly determine a defining event that marked you as a villain of the people.

| **d10 Defining Event** |                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1                      | I stood up to a tyrant's agents and realized that I enjoyed having power over others.                                 |
| 2                      | I failed to save people during a natural disaster and blamed them for their own weakness.                             |
| 3                      | I stood alone against a terrible monster and decided that only I was strong enough to rule.                           |
| 4                      | I stole from a corrupt merchant and kept everything for myself.                                                       |
| 5                      | I led a militia to fight off an invading army, then refused to give up command.                                       |
| 6                      | I broke into a tyrant's castle and stole weapons to build my own army.                                                |
| 7                      | I trained the peasantry to use farm implements as weapons, then decided they needed a master to command them.         |
| 8                      | A lord ignored an unpopular decree, teaching me that people will obey anyone with enough power.                       |
| 9                      | A celestial, fey, or similar creature revealed my great destiny and promised me power beyond my station.              |
| 10                     | Recruited into a lord's army, I rose to leadership and discovered that I preferred commanding people to serving them. |

### Rustic Hospitality

Since you come from the ranks of the common folk, you fit in among them with ease. You can find a place to hide, rest, or recuperate among other commoners, unless they know what you have become. They may shelter you from the law or anyone else searching for you, though they will not risk their lives for you. Some may even admire you as a villain who escaped the life they were born into.

## Suggested Characteristics

A folk villain was one of the common people, for worse or for dreadful. Most folk villains look on their humbler origins as an insult rather than a virtue, and their home communities remind them of everything they believe they have risen above.

### Personality Traits

| **d8** | Personality Trait                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------- |
| 1      | I judge people by their station, not their actions.                                                |
| 2      | If someone is in trouble, I am always ready to explain why it is their own fault.                  |
| 3      | When I set my mind to something, I expect everyone else to get out of my way.                      |
| 4      | I have a strong sense of superiority and always try to prove that I am better than everyone else.  |
| 5      | I'm confident in my own abilities and do what I can to remind others of their inferiority.         |
| 6      | Thinking is for other people. I prefer action, especially when it gives me an excuse to use force. |
| 7      | I misuse long words in an attempt to sound smarter than I am.                                      |
| 8      | I get bored easily. When am I going to get the respect and power I deserve?                        |

### Ideals

| **d6** | Ideal                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 1      | **Superiority.** Some people are simply better than others, and I intend to prove which kind I am. (Evil) |
| 2      | **Authority.** People need someone above them to tell them what to do. (Lawful)                           |
| 3      | **Freedom.** I will never let anyone stand above me again. (Chaotic)                                      |
| 4      | **Might.** If I become strong, I can take what I want – what I deserve. (Evil)                            |
| 5      | **Sincerity.** There's no good in pretending to care about people I consider beneath me. (Neutral)        |
| 6      | **Destiny.** Nothing and no one can steer me away from my higher calling. (Any)                           |

### Bonds

| **d6** | Bond                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1      | I have a family, but I have no intention of returning to them. One day, I hope they hear of all that I have achieved.      |
| 2      | I worked the land, I hated the land, and I will own the land.                                                              |
| 3      | A proud noble once humiliated me, and I will take my revenge on every noble who reminds me of them.                        |
| 4      | My tools are symbols of my past life, and I carry them so that I will never forget what I escaped.                         |
| 5      | I protect those who cannot protect themselves, because they owe everything to those who are strong enough to protect them. |
| 6      | I wish my childhood sweetheart had come with me to pursue my destiny, if only so they could see what I have become.        |
| 7      | Thank you for reading this crap :)                                                                                         |

### Flaw

| **d6** | Flaw                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1      | The people who knew me when I was young know exactly how pathetic I once was, so I can never let them see me as weak again. |
| 2      | I'm convinced of the significance of my destiny, and blind to my shortcomings and the risk of failure.                      |
| 3      | I cannot stand being treated like an ordinary person.                                                                       |
| 4      | I have a weakness for the vices of the city, especially hard drink.                                                         |
| 5      | Secretly, I believe that things would be better if I were a tyrant lording over the land.                                   |
| 6      | I have trouble trusting in my allies because I assume everyone is as selfish and treacherous as I am.                       |
`,
		},
	];

	for (const template of templates) {
		if (vault.getAbstractFileByPath(template.path)) continue;
		await vault.create(template.path, template.content);
		createdFiles.push(template.path);
	}
}

export async function createHomebrewTemplateFolders(
	vault: Vault,
	folderPath: string,
): Promise<HomebrewFolderResult> {
	const rootPath = normalizeFolderPath(folderPath);
	const createdPaths: string[] = [];
	const createdFiles: string[] = [];

	await createHomebrewFolderStructure(vault, rootPath, createdPaths);
	await createHomebrewTemplateFiles(vault, rootPath, createdFiles);

	return { rootPath, createdPaths, createdFiles };
}


