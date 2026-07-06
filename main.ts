#!/usr/bin/env -S deno run --allow-read --allow-write=public main.ts

import _HEAD from "./head.html" with { type: "text" };
import * as TOML from "@std/toml";
import * as HTML from "@huguesguilleus/html";

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

type Event = {
	path: string;
	name: string;
	date: Date;
	place: { name: string; addr: string };
	notes: string[];
};

await Deno.mkdir("public", { recursive: true });
await Deno.copyFile("favicon.webp", "public/favicon.webp");
await Deno.copyFile("robots.txt", "public/robots.txt");

const future_events = [];

for (const year of [2026]) {
	const { event } = TOML.parse(await Deno.readTextFile(year + ".toml")) as {
		event: Event[];
	};
	await Deno.mkdir(`public/${year}`, { recursive: true });

	// Generate event page
	for (const e of event) {
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

	// Get future event.
	for (const e of event) {
		if (e.date.valueOf() > Date.now()) {
			future_events.push(e);
		}
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
				HTML.html("main", event.map((event) => print_event(event, true))),
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
			HTML.htmlAttr`a.link href=2026.html`(2026 + ""),
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
			? HTML.htmlAttr`a href='${line}'`(line)
			: HTML.html("p", line)
	);
}

function print_event(event: Event, notPage: boolean): HTML.HTML {
	return HTML.htmlAttr`${notPage ? "a" : "div"}.event${
		event.date.valueOf() < Date.now() ? ".old" : ""
	} href="${event.date.getFullYear() + ""}/${event.path}.html"`(
		HTML.html("h2", event.name),
		HTML.html(
			"div",
			Intl.DateTimeFormat("fr", {
				dateStyle: "full",
				timeStyle: "short",
				timeZone: "Europe/Paris",
			}).format(event.date),
		),
		HTML.html("div", event.place.name),
		HTML.html("div", event.place.addr),
	);
}
