// Inspiration:
// - https://youtu.be/jDJHtLCHuAg
// - http://aramor.epizy.com/fallout-terminal/password?diff=1

import { getScreen, addTemplate } from "../util/screens.js";
import { type } from "../util/io.js";
import clear from "./clear.js";
import { typeSound } from "../sound/index.js";
import shuffle from "../util/shuffle.js";
import pause from "../util/pause.js";

const ROWS = 2 * 17; // Rows in the cypher text
const CHARS_PER_ROW = 12; // Number of characters per row
const MAX = ROWS * CHARS_PER_ROW; // Max number of characters in the cypher text

const CHARS = `!@#$%^&*()-_[]{}<>\\|'";:/?,.`;
const MAX_LIVES = 5;

// Fast config for the typer
const FAST = {
	wait: 15,
	initialWait: 100
};

// Globals
let activeWord;
let selectedWords = [];
let password;
let hex = rnd(0xf000) + 0x0c00;
let lives = MAX_LIVES;
let wordLength = 6;
let activeElement = null;
let promising = 0;
let promisingTimout;

// The main function, shows intro screen and the game screen
async function command() {
	clear();

	//await intro();
	await game();
}

async function intro() {
	let intro = getScreen("intro");

	await type("Welcome to ROBCO Industries (TM) Termlink", FAST, intro);

	await type(">SET TERMINAL/INQUIRE", {}, intro);

	await type("RIT-V300", FAST, intro);

	await type(
		[
			">SET FILE/PROTECTION=OWNER:RWED ACCOUNTS.F",
			">SET HALT RESTART/MAINT"
		],
		{ newlineWait: 200 },
		intro
	);

	await type(
		[
			"Initializing Robco Industries(TM) MF Boot Agent v2.3.0",
			"RETROS BIOS",
			"RBIOS-4.02.08.00 52EE5.E7.E8",
			"Copoyright 2201-2203 Robco Ind.",
			"Uppermem: 64 KB",
			"Root (5A8)",
			"Maintenance Mode"
		],
		FAST,
		intro
	);

	await type(">RUN DEBUG/ACCOUNTS.F", { finalWait: 1000 }, intro);

	intro.remove();
}

// Game renders the hacking game screen and calls outro() on correct password
async function game() {
	let screen = getScreen("fallout");

	// Resolves on correct password
	return new Promise(async resolve => {
		await type(
			["Welcome to ROBCO Industries (TM) Termlink", "Password Required"],
			FAST,
			screen
		);

		//Make sure things are reset at the beginning of the game
		lives = MAX_LIVES;
		selectedWords = [];

		// Get list of words
		let words = await fetch("../util/words.txt").then(res => res.text());
		words = words.split(" ");

		// Get arrays of words of the same length, the object is indexed by word length
		let wordBucket = {};
		words.forEach(word => {
			wordBucket[word.length] = wordBucket[word.length]
				? [...wordBucket[word.length], word]
				: [word];
		});

		// Setup the hacking screen
		await addTemplate("hacking", screen);

		await updateLives();
		//updateLives();

		let text = generateText(wordBucket[wordLength], wordLength);

		let cypher = screen.querySelector(".cypher");

		// Show the cypher text on screen, line by line
		for (let rowNr = 0; rowNr < ROWS; rowNr++) {
			let row = document.createElement("div");
			row.classList.add("row");

			// Get the next batch of characters to print
			let chars = text
				.slice(
					rowNr * CHARS_PER_ROW,
					rowNr * CHARS_PER_ROW + CHARS_PER_ROW
				)
				.map(charToSpan);

			cypher.appendChild(row);
			await type(
				[nextHex(), ...chars],
				{
					wait: 10,
					initialWait: 0,
					finalWait: 0,
					useContainer: true,
					processChars: false
				},
				row
			);
			// for debugging:
			// [nextHex(), ...chars].forEach(e => row.appendChild(e));
		}

		// Register event handlers (hover + keyboard)
		let wordSpans = [...cypher.querySelectorAll("span")];
		wordSpans.forEach(wordSpan => {
			wordSpan.addEventListener("mouseenter", handleWordHover);
			wordSpan.addEventListener("mouseleave", handleWordOut);
		});

		let passwords = [...cypher.querySelectorAll("[data-password]")];
		passwords.forEach(pw => {
			pw.addEventListener("click", event =>
				handlePassword(event.target, resolve)
			);
		});

		let specials = [...cypher.querySelectorAll("[data-special]")];
		specials.forEach(special => {
			special.addEventListener("click", event =>
				handleSpecial(event.target)
			);
		});

		cypher.addEventListener("keydown", e => onKeyDown(e, resolve));
		cypher.focus();
	});
}

// Outro shows screen with buttons to restart (calls game()) or exit
async function outro() {
	let outro = getScreen("outro");

	await new Promise(async resolve => {
		await type(
			[
				"Welcome to ROBCO Industries (TM) Termlink",
				`"We're in the business of happiness"`
			],
			FAST,
			outro
		);

		await type("> Password accepted", { typerClass: "end" }, outro);

		console.log("This is where we call the relay for winning");

		let restart = document.createElement("a");
		restart.innerText = "[Restart]";
		restart.href = "#";
		restart.onclick = () => {
			outro.remove();
			resolve(game());
		};

		let exit = document.createElement("a");
		exit.innerText = "[Exit terminal]";
		exit.href = "#";
		exit.onclick = resolve;

		await type([restart, exit], { processChars: false, wait: 100 }, outro);

		restart.focus();
	});

	outro.remove();
}

// Random number between 0 and max
function rnd(max) {
	return Math.floor(Math.random() * max);
}

function getChars(word, nr) {
	return word.split("").map(text => ({ text, nr }));
}

function getGarble(length) {
	return Array(length)
		.fill(0)
		.map(() => ({
			text: CHARS[rnd(CHARS.length)]
		}));
}

function getSpecial(length, nr) {
	let open;
	let close;

	let r = Math.random();
	if (r < 0.3) {
		open = "[";
		close = "]";
	} else if (r < 0.6) {
		open = "<";
		close = ">";
	} else {
		open = "(";
		close = ")";
	}

	// -2 for open and close char, with minimum of 1 random
	let garble = getGarble(Math.max(length - 2, 1));
	return [{ text: open }, ...garble, { text: close }].map(s => ({
		...s,
		special: nr
	}));
}

// Adds a random amount between 1 and 7 to the global hex variable and returns the new hex string
function nextHex() {
	let next = document.createElement("span");
	hex += rnd(6) + 1;
	next.textContent = `0x${hex.toString(16).toUpperCase()} `;
	return next;
}

// Generates an array of objects, consisting of random punctuation characters,
// passwords and specials up to the maximum character count. A special can be clicked
// once to remove a dud password or reset the lives.
// These objects can easily be formatted and converted to DOM elements.
// A returned object contains:
// - text: character to display on screen
// - nr: (optional) password number in the list of possible words
// - special: (optional) number of in the list of all specials.
function generateText(words, length) {
	let output = [];
	let wordCount = 0;
	let specialCount = 0;

	words = shuffle(words);

	while (output.length < MAX) {
		let diff = MAX - output.length;
		// First generate some garble
		let garble = Math.min(diff, rnd(15) + 15 - length);

		output = [...output, ...getGarble(garble)];

		// Then, generate either a special (small chance) or a password
		if (Math.random() < 0.3) {
			let specialLength = rnd(6) + 3;
			if (output.length + specialLength < MAX) {
				output = [
					...output,
					...getSpecial(specialLength, specialCount)
				];
				specialCount++;
			}
		} else {
			// Get the next password
			let word = words[wordCount];
			// Only add a word if it fits
			if (output.length + word.length < MAX) {
				selectedWords = [...selectedWords, word];
				console.log("selected words: "+selectedWords);
				let chars = getChars(word, wordCount);
				output = [...output, ...chars];
				wordCount++;
			}
		}
	}

	// The correct password is one of the selected words
	password = selectedWords[rnd(selectedWords.length - 1)];
	console.log("password: "+password);


	return output;
}

// Returns a group of sibling spans that belong to the same word if they have data-word or data-special attr.
// Otherwise returns a single span.
function getActiveSpans(el) {
	let wordSpans = [el];

	// Get the data from the selected  character
	let { word, special } = el.dataset;
	if (word) {
		wordSpans = [...document.querySelectorAll(`[data-word="${word}"`)];
	} else if (special) {
		wordSpans = [
			...document.querySelectorAll(`[data-special="${special}"`)
		];
	}

	return wordSpans;
}

// Updates the text indicator for number of lives based on the global lives variable.
async function updateLives() {
	let span = document.querySelector(".lives");

	let blocks = Array(lives)
		.fill(0)
		.map(() => "■ ")
		.join("");
	return await type(`Attempts remaining: ${blocks}`, { clearContainer: true }, span);
}

// Callback for highlighting an element, and possible its related elements, if it
// is part of a word or special. Types the hovered char/word in the bottom right.
function focusElement(target) {
	//typeSound();
	let spans = getActiveSpans(activeElement);

	spans.forEach(span => span.classList.remove("active"));
	activeElement = target;
	spans = getActiveSpans(target);

	let wordNr = target.dataset.word;

	let activeWordText = "";
	spans.forEach(span => {
		span.classList.add("active");
		activeWordText += span.textContent;
	});

	if (!wordNr || wordNr !== activeWord) {
		let active = document.querySelector(".active-word");
		active.textContent = "";
		type(
			activeWordText,
			{ initialWait: 0, useContainer: false, stopBlinking: false },
			active
		);
	}

	activeWord = wordNr;
}

function handleWordHover(event) {
	focusElement(event.target);
}

function handleWordOut(event) {
	let target = event.target;
	let spans = getActiveSpans(target);
	spans.forEach(span => span.classList.remove("active"));
}

// Shows feedback for the error, subtracts a life.
// If no lives are left, the terminal is locked.
async function error(pw, resolve) {
	lives -= 1;

	if (lives === 0) {
		document.querySelector(".fallout").remove();
		console.log("This is where we call the failure relay!");

		let locked = getScreen("locked");

		await type(
			["Terminal locked", "", "Terminal will unlock in 2 minutes"],
			{ useContainer: false },
			locked
		);
		await pause(30);
		locked.remove();
		return resolve();
	}

	/*else 
	{
		return new Promise(resolve => {
*/
		let output = document.querySelector(".output");

		let active = output.querySelector(".active-word");
		let pre = document.createElement("pre");

		let likeness = pw
			.split("")
			.reduce((total, c, i) => (total += Number(c === password[i])), 0);

		pre.textContent = `>${pw}
	>Entry denied
	>Likeness=${likeness}`;

		output.insertBefore(pre, active);
		console.log("before update, lives: "+ lives);
		await updateLives();
		//updateLives();
		console.log("after update, lives: "+ lives);
		console.log("After pause... Shouldn't be able to do anything till this shows up");
		//resolve();
		/*});
	}*/
}

// If pw is correct, clean up the screen, otherwise call error function
async function handlePassword(target, resolve) {
	var d = new Date();
	var n = d.getTime();
	if (promising != 0 && n-promisingTimout < 5000)
	{

		console.log("rutnring out because not reset yet");
		
	}
	else 
	{
		promising =1;
		var d = new Date();
		promisingTimout = d.getTime();
		let wordNr = target.dataset.word;
		let pw = selectedWords[wordNr];
		console.log("pw/password: "+ pw+"/"+password);

		if (pw === password) {
			let screen = document.querySelector(".fallout");
			screen.remove();
			promising = 0;
			resolve(outro());
		} else {
			if (pw)
			{
				await error(pw, resolve);
				promising = 0;
			}
		}
	}
}

function charToSpan(char) {
	let span = document.createElement("span");
	span.innerText = char.text;

	if (char.nr !== undefined) {
		span.dataset.word = char.nr;
		span.dataset.password = true;
	}

	if (char.special !== undefined) {
		span.dataset.special = char.special;
	}

	if (!activeElement) {
		activeElement = span;
		span.classList.add("active");
	}
	return span;
}

// Clicking a special group either removes a dud password,
// or resets the lives to the maximum. Then it disables
// the special from further use.
function handleSpecial(target) {
	let output = document.querySelector(".output");
	let active = output.querySelector(".active-word");
	
	if(target.textContent == ".")
	{
		return;
	}

	let special = target.dataset.special;
	let specs = [...document.querySelectorAll(`[data-special="${special}"]`)];

	let specialText = specs.map(s => s.textContent).join("");

	let pre = document.createElement("pre");
	if (Math.random() < 0.66 || lives === MAX_LIVES) {
		let pwIndex = selectedWords.indexOf(password);
		let duds = [...document.querySelectorAll(`[data-word]`)].filter(
			e => e.dataset.word !== pwIndex
		);

		let dudNr = duds[rnd(duds.length)].dataset.word;

		// Disable the dud letters
		let dudSpans = [...document.querySelectorAll(`[data-word="${dudNr}"]`)];
		dudSpans.forEach(span => {
			delete span.dataset.word;
			span.textContent = ".";
		});

		pre.textContent = `>${specialText}
>Dud removed.`;
	} else {
		lives = MAX_LIVES;
		pre.textContent = `>${specialText}
>Tries reset.`;

		updateLives();
	}

	output.insertBefore(pre, active);

	// Disable the clicked special
	specs.forEach(s => {
		s.classList.remove("active");
		delete s.dataset.special;
		s.textContent = ".";
		
	});
}

// Handles moving the cursor using arrow keys and confirm using enter key
function onKeyDown(e, resolve) {
	e.preventDefault();
	let nextElement;
	let row = activeElement.parentNode;
	let rows = Array.from(row.parentNode.children);
	let elementIndex = Array.from(row.children).indexOf(activeElement);
	let rowNr = rows.indexOf(row);

	// up arrow
	if (e.keyCode === 38) {
		if (rows[rowNr - 1]) {
			nextElement = rows[rowNr - 1].childNodes[elementIndex];
		}
	}
	// down arrow
	else if (e.keyCode === 40) {
		if (rows[rowNr + 1]) {
			nextElement = rows[rowNr + 1].childNodes[elementIndex];
		}
	}
	// left arrow
	else if (e.keyCode === 37) {
		let prevRow = rows[rowNr - 17];
		if (activeElement.previousElementSibling) {
			nextElement = activeElement.previousElementSibling;
		} else if (prevRow) {
			nextElement = prevRow.childNodes[prevRow.childNodes.length - 1];
		}
	}
	// right arrow
	else if (e.keyCode === 39) {
		if (activeElement.dataset.word) {
			let list = row.querySelectorAll(
				`[data-word="${activeElement.dataset.word}"]`
			);
			activeElement = list.item(list.length - 1);
		} else if (activeElement.dataset.special) {
			let list = row.querySelectorAll(
				`[data-special="${activeElement.dataset.special}"]`
			);
			activeElement = list.item(list.length - 1);
		}

		if (activeElement.nextElementSibling) {
			nextElement = activeElement.nextElementSibling;
		} else if (rows[rowNr + 17]) {
			nextElement = rows[rowNr + 17].childNodes[0];
		}
	}
	// enter
	else if (e.keyCode === 13) {
		if (activeElement.dataset.word) {
			handlePassword(activeElement);
		} else if (activeElement.dataset.special) {
			handleSpecial(activeElement);
		}
	}

	if (nextElement) {
		focusElement(nextElement);
	}
}

const stylesheet = "fallout";
const template = "fallout";

export { stylesheet, template };
export default command;
