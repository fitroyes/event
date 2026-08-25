#!/usr/bin/env -S deno run --allow-read --allow-write=public main.ts

import _HEAD from "./head.html" with { type: "text" };
import * as TOML from "@std/toml";
import * as HTML from "@huguesguilleus/html";
import { walk } from "@std/fs";

const HEAD = {
	h: _HEAD
		.replaceAll(/[\n\t]+/g, "")
		.replaceAll(": ", ":")
		.replaceAll(" {", "{")
		.replaceAll(";}", "}"),
};

const ABOUT = HTML.html(
	"footer.about",
	HTML.html(
		"div",
		"Ce site web référence des évènements concernant des luttes progressistes qui se déroulent autour à Troyes.",
	),
	HTML.htmlAttr`a href=https://github.com/fitroyes/event/ `("Code source"),
);

const dateFormat = Intl.DateTimeFormat("fr", {
	dateStyle: "full",
	timeStyle: "short",
	timeZone: "Europe/Paris",
});

type Event = {
	path: string;
	name: string;
	date: Date;
	end?: Date;
	place: { name: string; addr: string };
	notes: string[];
};

await Deno.mkdir("public", { recursive: true });
await Deno.copyFile("favicon.webp", "public/favicon.webp");
await Deno.copyFile("robots.txt", "public/robots.txt");

const future_events = [];
const now = new Date();
const events = new Map<number, Event[]>();
for await (const { path } of walk(".", { exts: [".toml"], maxDepth: 1 })) {
	console.log("read", path, "...");
	const data = TOML.parse(await Deno.readTextFile(path)) as { event: Event[] };
	for (const event of data.event) {
		const year = event.date.getFullYear();
		events.set(year, events.get(year) ?? []);
		events.get(year)?.push(event);
		const m = (event.date.getMonth() + 1).toString().padStart(2, "0");
		const d = event.date.getDate().toString().padStart(2, "0");
		event.path = `${year}${m}${d}-${event.path}`;
		if (now < event.date) {
			future_events.push(event);
		}
	}
}

for (const list of events.values()) {
	list.sort((a, b) => a.date.valueOf() - b.date.valueOf());
}

for (const [year, list] of events.entries()) {
	await Deno.mkdir(`public/${year}`, { recursive: true });

	// Generate event page
	for (const e of list) {
		await Deno.writeTextFile(
			`public/${year}/${e.path}.html`,
			HTML.htmlRoot(
				"html lang=fr",
				HTML.html(
					"head",
					HEAD,
					HTML.html("link rel=icon href=../favicon.webp"),
					HTML.html("title", e.name),
					HTML.html(
						"script type=application/ld+json",
						{
							h: JSON.stringify({
								"@context": "https://schema.org/",
								"@type": "Event",
								name: e.name,
								startDate: e.date,
								location: {
									"@type": "Place",
									name: e.place.name,
									address: {
										"@type": "PostalAddress",
										name: e.place.addr,
									},
								},
							}),
						},
					),
				),
				HTML.html(
					"body",
					HTML.html("header", HTML.html("h1", e.name)),
					HTML.htmlAttr`a.link href=../ `("Accueil"),
					HTML.htmlAttr`a.link href=../${year + ""}.html `(year + ""),
					HTML.html(
						"main",
						print_event(e, false),
						HTML.html(".main", notes(e.notes)),
					),
					ABOUT,
				),
			),
		);
	}

	// Generate year index
	await Deno.writeTextFile(
		`public/${year}.html`,
		HTML.htmlRoot(
			"html lang=fr",
			HTML.html(
				"head",
				HEAD,
				HTML.html("link rel=icon href=favicon.webp"),
				HTML.html("title", "Agenda " + year),
				HTML.html("meta name=googlebot content=noindex"),
			),
			HTML.html(
				"body",
				HTML.html("header", HTML.html("h1", "Agenda " + year)),
				HTML.htmlAttr`a.link href=./index.html `("Accueil"),
				HTML.html("main", list.map((event) => print_event(event, true))),
				ABOUT,
			),
		),
	);
}

// Generate root index
await Deno.writeTextFile(
	`public/index.html`,
	HTML.htmlRoot(
		"html lang=fr",
		HTML.html(
			"head",
			HEAD,
			HTML.html("link rel=icon href=favicon.webp"),
			HTML.html("title", "Futurs évènements"),
		),
		HTML.html(
			"body",
			HTML.html("header", HTML.html("h1", "Futurs évènements")),
			[...events.keys()].map((year) =>
				HTML.htmlAttr`a.link href=${year + ""}.html`(year + "")
			),
			HTML.htmlAttr`a.link href=events.ics`("ICS"),
			HTML.html(
				"main",
				...future_events.map((event) => print_event(event, true)),
			),
			ABOUT,
		),
	),
);

function notes(lines: string[] = []): HTML.HTML[] {
	return lines.map((line) =>
		/^https?:\/\//.test(line)
			? HTML.html("div", HTML.htmlAttr`a href='${line}'`(line))
			: HTML.html("p", line)
	);
}

function print_event(event: Event, notPage: boolean): HTML.HTML {
	return HTML.htmlAttr`${notPage ? "a" : "div"}.event${
		event.date.valueOf() < Date.now() ? ".old" : ""
	} href="${event.date.getFullYear() + ""}/${event.path}.html"`(
		notPage && HTML.html("h2", event.name),
		HTML.html(
			"div",
			event.end
				? dateFormat.formatRange(event.date, event.end)
				: dateFormat.format(event.date),
		),
		HTML.html("div", event.place.name),
		HTML.html("div", event.place.addr),
	);
}

let ics = "BEGIN:VCALENDAR\nVERSION:2.0\n\n";
for (const event of future_events) {
	ics += "BEGIN:VEVENT\n";
	ics += "DTSTART:" +
		event.date.toJSON().replaceAll(/[-:]/g, "").replace(".000Z", "Z\n");
	ics += "DTEND:" +
		(event.end ?? new Date(event.date.valueOf() + 3600_000)).toJSON()
			.replaceAll(
				/[-:]/g,
				"",
			).replace(".000Z", "Z\n");
	ics += "SUMMARY:" + event.name + "\n";
	ics += "TRANSP:TRANSPARENT\n";
	ics += `LOCATION:${event.place.name} ${event.place.addr}\n`;
	for (const line of event.notes) {
		ics += "DESCRIPTION:" + line + "\n";
	}
	ics += "END:VEVENT\n\n";
}
ics += "END:VCALENDAR";
await Deno.writeTextFile("public/events.ics", ics);
