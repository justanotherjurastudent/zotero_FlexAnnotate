"use strict";

/**
 * Anlegen und Bearbeiten von Print-Annotationen.
 *
 * Feldregeln verifiziert gegen Zotero 10.0.1 (item.js:4487-4555):
 *  - `annotationType` muss vor allen anderen Annotation-Feldern gesetzt werden
 *  - `annotationText` ist nur bei 'highlight' und 'underline' erlaubt
 *  - `annotationColor` muss /#[a-f0-9]{6}/ erfüllen (Kleinbuchstaben)
 *  - `annotationSortIndex` muss bei PDF-Parent /^\d{5}\|\d{6}\|\d{5}$/ erfüllen
 */
FlexAnnotate.PrintAnnotations = {
	/** Von Zotero unterstützte Farben, siehe annotations.js (Zotero.Annotations.COLORS) */
	DEFAULT_COLOR: '#ffd400',

	/**
	 * Zoteros Annotationen kennen nur `annotationPageLabel`, kein Feld für die Art der
	 * Fundstelle. Bei Print-Quellen ist das aber oft keine Seite (Randnummer, Paragraf,
	 * Fußnote …). Der Locator-Typ wird deshalb als automatischer Tag an der Annotation
	 * geführt: Tags sind Bordmittel, werden mitsynchronisiert und überstehen den
	 * Roundtrip über andere Geräte.
	 *
	 * 'page' ist der Standard und wird nicht getaggt, damit Bibliotheken sauber bleiben.
	 */
	LOCATOR_TAG_PREFIX: '#flexannotate-locator-',
	/** Standard-Locator eines ganzen Dokuments, als automatischer Tag am Anhang */
	DEFAULT_LOCATOR_TAG_PREFIX: '#flexannotate-default-locator-',
	DEFAULT_LOCATOR: 'page',

	/**
	 * Legt eine Print-Annotation unter dem Platzhalter-Attachment eines Titels an.
	 *
	 * @param {Zotero.Item} item - Reguläres Titel-Item
	 * @param {Object} data
	 * @param {String} data.pageLabel - Druckseitenzahl, wie sie zitiert werden soll
	 * @param {String} [data.text] - Zitat (nur bei type 'highlight'/'underline')
	 * @param {String} [data.comment] - Eigener Kommentar
	 * @param {String} [data.color]
	 * @param {String} [data.type] - 'highlight' | 'underline' | 'note'
	 * @param {String} [data.locator] - CSL-Locator, z. B. 'page' oder 'paragraph'
	 * @param {String[]} [data.tags] - Schlagwörter, die an die Annotation gehängt werden
	 * @return {Promise<Zotero.Item>}
	 */
	async create(item, data) {
		let attachment = await FlexAnnotate.Placeholder.ensure(item);
		let type = data.type || 'highlight';
		let comment = data.comment || '';

		let annotation = new Zotero.Item('annotation');
		annotation.libraryID = attachment.libraryID;
		annotation.parentID = attachment.id;
		// Muss zuerst gesetzt werden, sonst wirft item.js:4488
		annotation.annotationType = type;

		if (type === 'highlight' || type === 'underline') {
			annotation.annotationText = data.text || '';
		}
		else if (data.text) {
			// Bei 'note' kennt Zotero kein Zitatfeld (item.js:4507): der Text wandert in
			// den Kommentar, statt stillschweigend verloren zu gehen.
			comment = [data.text, comment].filter(Boolean).join('\n\n');
		}

		annotation.annotationComment = comment;
		annotation.annotationColor = this.normalizeColor(data.color);
		annotation.annotationPageLabel = String(data.pageLabel ?? '').trim();
		annotation.annotationSortIndex = this.buildSortIndex(data.pageLabel);
		annotation.annotationPosition = JSON.stringify({
			pageIndex: 0,
			rects: [[0, 0, 0, 0]]
		});

		this.applyLocatorTag(annotation, data.locator);

		for (let tag of data.tags || []) {
			annotation.addTag(tag);
		}

		await annotation.saveTx();
		// annotationPageLabel liest sich nach dem Speichern als null zurück, wenn es leer
		// war (item.js:2290 schreibt `pageLabel || null`) — sonst stünde "null" im Log.
		FlexAnnotate.log(`Created print annotation ${annotation.key} on page `
			+ `"${annotation.annotationPageLabel || ''}"`);
		return annotation;
	},

	/**
	 * Ändert eine bestehende Print-Annotation.
	 *
	 * @param {Zotero.Item} annotation
	 * @param {Object} data - Wie bei create(); nur gesetzte Felder werden übernommen
	 * @return {Promise<Zotero.Item>}
	 */
	async update(annotation, data) {
		if (!annotation.isAnnotation()) {
			throw new Error("Not an annotation item");
		}

		if (data.text !== undefined
				&& ['highlight', 'underline'].includes(annotation.annotationType)) {
			annotation.annotationText = data.text;
		}
		if (data.comment !== undefined) {
			annotation.annotationComment = data.comment;
		}
		if (data.color !== undefined) {
			annotation.annotationColor = this.normalizeColor(data.color);
		}
		if (data.pageLabel !== undefined) {
			annotation.annotationPageLabel = String(data.pageLabel).trim();
			// Der sortIndex nativer Annotationen kodiert die Position im Dokument und
			// darf nicht aus der Seitenzahl überschrieben werden.
			if (FlexAnnotate.Placeholder.isPlaceholder(annotation.parentItem)) {
				annotation.annotationSortIndex = this.buildSortIndex(data.pageLabel);
			}
		}
		if (data.locator !== undefined) {
			this.applyLocatorTag(annotation, data.locator);
		}

		await annotation.saveTx();
		FlexAnnotate.log(`Updated print annotation ${annotation.key}`);
		return annotation;
	},

	/**
	 * Liefert den Locator-Typ einer Annotation: erst der eigene Tag, dann der Standard
	 * des Dokuments (Anhangs), zuletzt 'page'. Gilt für Print-Annotationen und für
	 * Annotationen in PDF/EPUB/Snapshot gleichermaßen.
	 *
	 * @param {Zotero.Item} annotation
	 * @return {String} z. B. 'page', 'paragraph', 'section'
	 */
	getLocator(annotation) {
		for (let tag of annotation.getTags()) {
			if (tag.tag.startsWith(this.LOCATOR_TAG_PREFIX)) {
				let locator = tag.tag.slice(this.LOCATOR_TAG_PREFIX.length);
				if (Zotero.Cite.labels.includes(locator) || locator === 'margin') {
					return locator;
				}
			}
		}
		return this.getDefaultLocator(annotation.parentItem);
	},

	/**
	 * Standard-Locator eines Dokuments. Er hängt als automatischer Tag am Anhang und
	 * gilt für alle Annotationen darunter, die keinen eigenen Locator-Tag tragen —
	 * auch für künftig im Reader angelegte.
	 *
	 * @param {Zotero.Item|null} attachment
	 * @return {String}
	 */
	getDefaultLocator(attachment) {
		if (attachment) {
			for (let tag of attachment.getTags()) {
				if (tag.tag.startsWith(this.DEFAULT_LOCATOR_TAG_PREFIX)) {
					let locator = tag.tag.slice(this.DEFAULT_LOCATOR_TAG_PREFIX.length);
					if (Zotero.Cite.labels.includes(locator) || locator === 'margin') {
						return locator;
					}
				}
			}
		}
		return this.DEFAULT_LOCATOR;
	},

	/**
	 * Prüft, ob eine Annotation einen ausdrücklichen FlexAnnotate-Locator-Tag besitzt.
	 *
	 * @param {Zotero.Item} annotation
	 * @return {Boolean}
	 */
	hasExplicitLocator(annotation) {
		if (!annotation || typeof annotation.getTags !== 'function') {
			return false;
		}
		for (let tag of annotation.getTags()) {
			if (tag.tag.startsWith(this.LOCATOR_TAG_PREFIX)) {
				return true;
			}
		}
		return false;
	},

	/**
	 * Setzt den Standard-Locator eines Dokuments und speichert den Anhang. 'page' ist
	 * der Grundzustand und entfernt den Tag wieder.
	 * Bestehende Annotationen ohne expliziten Tag werden auf den bisherigen Standard
	 * eingefroren, damit die künftige Vorgabe nicht rückwirkend bestehende Annotationen ändert.
	 *
	 * @param {Zotero.Item} attachment
	 * @param {String} locator
	 * @return {Promise<void>}
	 */
	async setDefaultLocator(attachment, locator) {
		if (!attachment || !attachment.isAttachment() || !attachment.isEditable()) {
			return;
		}
		if (!Zotero.Cite.labels.includes(locator) && locator !== 'margin') {
			throw new Error(`Unknown locator type: ${locator}`);
		}
		let previousDefault = this.getDefaultLocator(attachment);
		if (previousDefault === locator) {
			return;
		}

		// Alle bestehenden Annotationen ohne expliziten Locator auf den bisherigen
		// Standard einfrieren, damit "künftig für dieses Dokument" nicht rückwirkend greift.
		let existingAnns = attachment.getAnnotations();
		for (let ann of existingAnns) {
			if (ann.isEditable?.() !== false && !this.hasExplicitLocator(ann)) {
				ann.addTag(this.LOCATOR_TAG_PREFIX + previousDefault, 1);
				await ann.saveTx();
			}
		}

		for (let tag of attachment.getTags()) {
			if (tag.tag.startsWith(this.DEFAULT_LOCATOR_TAG_PREFIX)) {
				attachment.removeTag(tag.tag);
			}
		}
		if (locator !== this.DEFAULT_LOCATOR) {
			attachment.addTag(this.DEFAULT_LOCATOR_TAG_PREFIX + locator, 1);
		}
		await attachment.saveTx();
		FlexAnnotate.log(`Default locator of ${attachment.key} is now "${locator}"`);
	},

	/**
	 * Setzt den Locator-Tag; speichert nicht selbst.
	 *
	 * Ohne eigenen Tag folgt eine Annotation dem Standard ihres Dokuments. Wählt jemand
	 * 'page', obwohl das Dokument einen anderen Standard hat, muss das deshalb ein
	 * ausdrücklicher Tag sein; nur im Grundzustand (Standard und Wahl 'page') entfällt er.
	 *
	 * @param {Zotero.Item} annotation
	 * @param {String} [locator]
	 */
	applyLocatorTag(annotation, locator) {
		for (let tag of annotation.getTags()) {
			if (tag.tag.startsWith(this.LOCATOR_TAG_PREFIX)) {
				annotation.removeTag(tag.tag);
			}
		}
		if (!locator || (!Zotero.Cite.labels.includes(locator) && locator !== 'margin')) {
			return;
		}
		let documentDefault = this.getDefaultLocator(annotation.parentItem);
		if (locator !== this.DEFAULT_LOCATOR || documentDefault !== this.DEFAULT_LOCATOR) {
			annotation.addTag(this.LOCATOR_TAG_PREFIX + locator, 1);
		}
	},


	/**
	 * Löscht eine Print-Annotation und räumt ein leer gewordenes Platzhalter-Attachment auf.
	 *
	 * @param {Zotero.Item} annotation
	 * @return {Promise<void>}
	 */
	async erase(annotation) {
		let attachment = annotation.parentItem;
		await annotation.eraseTx();
		if (attachment) {
			await FlexAnnotate.Placeholder.cleanUpIfEmpty(attachment);
		}
	},

	/**
	 * Kodiert die Druckseitenzahl in den sortIndex, damit der Annotations-Tab nach
	 * Buchseite sortiert statt nach Anlagereihenfolge. Maßgeblich ist die erste
	 * Ziffernfolge im Label: "Rn. 12" sortiert wie Seite 12. Labels ganz ohne Ziffern
	 * (z. B. "XIV") bekommen alle denselben Höchstwert, landen damit hinten und stehen
	 * untereinander in unbestimmter Reihenfolge.
	 *
	 * @param {String|Number} pageLabel
	 * @return {String} Format: \d{5}|\d{6}|\d{5}
	 */
	buildSortIndex(pageLabel) {
		let match = String(pageLabel ?? '').match(/\d+/);
		let page = match ? Math.min(parseInt(match[0], 10), 99999) : 99999;
		return [
			String(page).padStart(5, '0'),
			'000000',
			'00000'
		].join('|');
	},

	/**
	 * @param {String} [color]
	 * @return {String} 6-stelliger Kleinbuchstaben-Hexwert
	 */
	normalizeColor(color) {
		let value = String(color || '').trim().toLowerCase();
		return /^#[a-f0-9]{6}$/.test(value) ? value : this.DEFAULT_COLOR;
	}
};
