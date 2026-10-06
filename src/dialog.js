"use strict";

/**
 * Eingabemaske für Annotationen — zum Anlegen und Nachbearbeiten von Print-Annotationen,
 * zum Nachbearbeiten (Locator, Seitenzahl, Kommentar …) nativer Annotationen aus PDF,
 * EPUB und Snapshot.
 *
 * Warum kein eigenes Dialogfenster: XUL-Elemente werden nur in privilegierten
 * chrome-Dokumenten geparst. Ein Plugin kann in Zotero 10 keine chrome://-URI
 * registrieren (plugins.js kennt kein chrome.manifest), und über window.openDialog()
 * mit einer file://- oder jar:-URL bleibt das Fenster deshalb leer — die Elemente
 * gelten als unbekannte Tags und auch onload-Attribute feuern nicht.
 *
 * Zotero baut seine gesamte eigene Oberfläche stattdessen mit
 * MozXULElement.parseXULToFragment() direkt im Hauptfenster (siehe elements/*.js).
 * Genau das machen wir hier: ein <panel> im bereits privilegierten Hauptfenster,
 * das auch schon unsere FTL geladen hat.
 *
 * Die Maske kennt drei Ansichten: 'full' (alle Felder), 'comment' (nur der Kommentar,
 * für „Kommentar hinzufügen") und 'locator' (Locator-Typ, Seitenzahl, Dokument-Standard).
 */
FlexAnnotate.Dialog = {
	PANEL_ID: 'flexannotate-print-annotation-panel',

	/** Typen, die beim Anlegen wählbar sind; weitere erscheinen nur beim Bearbeiten. */
	CREATABLE_TYPES: ['highlight', 'underline', 'note'],

	/**
	 * Öffnet die Maske zum Anlegen einer neuen Print-Annotation.
	 *
	 * @param {Window} window - Zotero-Hauptfenster
	 * @param {Zotero.Item} item - Reguläres Titel-Item
	 * @return {Promise<void>}
	 */
	async open(window, item) {
		let doc = window.document;
		await this.ensureLocatorsReady();
		let panel = this.build(window);
		panel._flexannotateState = {
			mode: 'create',
			view: 'full',
			item,
			annotation: null,
			annotations: [],
			requirePage: true
		};

		// Ein vorhandener Platzhalter kann einen Standard-Locator tragen
		let placeholder = FlexAnnotate.Placeholder.find(item);
		this.fill(doc, {
			source: item.getDisplayTitle(),
			locator: FlexAnnotate.PrintAnnotations.getDefaultLocator(placeholder),
			pageLabel: '',
			type: 'highlight',
			color: Zotero.Annotations.DEFAULT_COLOR,
			text: '',
			comment: ''
		});
		this.applyView(doc, 'full', false);
		// Der Typ bestimmt, ob Zotero ein Zitatfeld erlaubt — nachträglich nicht mehr änderbar
		doc.getElementById('flexannotate-dialog-type').disabled = false;

		this.show(window, panel, 'flexannotate-dialog-page');
	},

	/**
	 * Öffnet die Maske für bestehende Annotationen — Print-Annotationen ebenso wie
	 * native Annotationen aus PDF, EPUB und Snapshot.
	 *
	 * @param {Window} window - Zotero-Hauptfenster oder Reader-Fenster
	 * @param {Zotero.Item|Zotero.Item[]} annotations - Mehrere nur in der Ansicht 'locator'
	 * @param {Object} [options]
	 * @param {String} [options.view='full'] - 'full' | 'comment' | 'locator'
	 * @return {Promise<void>}
	 */
	async openForEdit(window, annotations, options = {}) {
		annotations = [].concat(annotations).filter(a => a && a.isAnnotation());
		if (!annotations.length) {
			return;
		}
		let doc = window.document;
		await this.ensureLocatorsReady();
		let panel = this.build(window);
		let annotation = annotations[0];
		let item = annotation.topLevelItem;
		let multi = annotations.length > 1;
		let view = multi ? 'locator' : (options.view || 'full');
		let isPrint = FlexAnnotate.Placeholder.isPlaceholder(annotation.parentItem);
		panel._flexannotateState = {
			mode: 'edit',
			view,
			item,
			annotation,
			annotations,
			// Print-Quellen zitieren ausschließlich über die Seitenzahl; bei nativen
			// Annotationen leitet Zotero sie notfalls aus dem Dokument ab.
			requirePage: isPrint
		};

		this.fill(doc, {
			source: item ? item.getDisplayTitle() : '',
			locator: FlexAnnotate.PrintAnnotations.getLocator(annotation),
			pageLabel: multi ? '' : (annotation.annotationPageLabel || ''),
			type: annotation.annotationType,
			color: annotation.annotationColor || Zotero.Annotations.DEFAULT_COLOR,
			text: annotation.annotationText || '',
			comment: annotation.annotationComment || ''
		});
		this.applyView(doc, view, multi);

		// Zotero erlaubt nur den Wechsel zwischen highlight und underline
		// (item.js:4494-4498), deshalb bleibt der Typ beim Bearbeiten fest.
		doc.getElementById('flexannotate-dialog-type').disabled = true;

		let focusID = {
			comment: 'flexannotate-dialog-comment',
			locator: 'flexannotate-dialog-locator',
			full: isPrint ? 'flexannotate-dialog-page' : 'flexannotate-dialog-comment'
		}[view];
		this.show(window, panel, focusID);
	},

	/**
	 * @param {Document} doc
	 * @param {Object} values
	 */
	fill(doc, values) {
		doc.getElementById('flexannotate-dialog-source').textContent = values.source;
		doc.getElementById('flexannotate-dialog-locator').value = values.locator;
		doc.getElementById('flexannotate-dialog-page').value = values.pageLabel;

		let panel = doc.getElementById(this.PANEL_ID);
		let state = panel?._flexannotateState;
		let attachment = state?.annotation?.parentItem || (state?.item ? FlexAnnotate.Placeholder.find(state.item) : null);
		let docDefault = FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);
		let defaultCheckbox = doc.getElementById('flexannotate-dialog-default');
		if (defaultCheckbox) {
			if (docDefault === values.locator && docDefault !== FlexAnnotate.PrintAnnotations.DEFAULT_LOCATOR) {
				defaultCheckbox.checked = true;
				defaultCheckbox.disabled = true;
			}
			else {
				defaultCheckbox.checked = false;
				defaultCheckbox.disabled = false;
			}
		}

		this.updateTypeMenu(doc, values.type);
		doc.getElementById('flexannotate-dialog-type').value = values.type;
		doc.getElementById('flexannotate-dialog-color').value = values.color;
		doc.getElementById('flexannotate-dialog-text').value = values.text;
		doc.getElementById('flexannotate-dialog-comment').value = values.comment;
		this.updateTextFieldState(doc);
	},

	/**
	 * Blendet die Gruppen ein, die zur Ansicht gehören, und passt die Breite des Fensters an.
	 *
	 * @param {Document} doc
	 * @param {String} view - 'full' | 'comment' | 'locator'
	 * @param {Boolean} multi - Mehrere Annotationen: keine einzelne Seitenzahl
	 */
	applyView(doc, view, multi) {
		let container = doc.getElementById('flexannotate-dialog-container');
		if (container) {
			if (view === 'locator') {
				container.style.width = '320px';
				container.style.minWidth = '280px';
				container.style.maxWidth = '360px';
			}
			else if (view === 'comment') {
				container.style.width = '380px';
				container.style.minWidth = '340px';
				container.style.maxWidth = '420px';
			}
			else {
				container.style.width = '440px';
				container.style.minWidth = '380px';
				container.style.maxWidth = '480px';
			}
		}

		let visible = {
			'flexannotate-dialog-group-locator': view !== 'comment',
			'flexannotate-dialog-group-typecolor': view === 'full',
			'flexannotate-dialog-group-text': view === 'full',
			'flexannotate-dialog-group-comment': view === 'full' || view === 'comment'
		};
		for (let [id, show] of Object.entries(visible)) {
			doc.getElementById(id).hidden = !show;
		}
		doc.getElementById('flexannotate-dialog-page').hidden = multi;
	},

	/**
	 * Zeigt außer den beim Anlegen wählbaren Typen nur den der bearbeiteten Annotation.
	 *
	 * @param {Document} doc
	 * @param {String} currentType
	 */
	updateTypeMenu(doc, currentType) {
		let popup = doc.getElementById('flexannotate-dialog-type-popup');
		for (let menuitem of popup.children) {
			let value = menuitem.getAttribute('value');
			menuitem.hidden = !this.CREATABLE_TYPES.includes(value) && value !== currentType;
		}
	},

	/**
	 * @param {Window} window
	 * @param {Element} panel
	 * @param {String} focusID - Element, das den Fokus bekommt
	 */
	show(window, panel, focusID) {
		let state = panel._flexannotateState;
		let view = state?.view || 'full';
		let width = view === 'locator' ? 320 : (view === 'comment' ? 380 : 440);
		let x = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
		let y = window.screenY + Math.max(0, (window.outerHeight - 320) / 3);
		panel.openPopupAtScreen(x, y, false);

		let targetEl = window.document.getElementById(focusID);
		if (targetEl) {
			setTimeout(() => {
				targetEl.focus();
				if (typeof targetEl.select === 'function') {
					targetEl.select();
				}
			}, 50);
		}
	},

	/**
	 * Legt das Panel einmalig an und liefert es bei weiteren Aufrufen wieder.
	 *
	 * @param {Window} window
	 * @return {Element}
	 */
	build(window) {
		let doc = window.document;
		let existing = doc.getElementById(this.PANEL_ID);
		if (existing) {
			return existing;
		}

		// Auch Reader-Fenster bauen die Maske selbst; ihnen fehlt unsere FTL noch
		try {
			window.MozXULElement.insertFTLIfNeeded("flexannotate.ftl");
		}
		catch (e) {
			FlexAnnotate.logError(e);
		}

		let fragment = window.MozXULElement.parseXULToFragment(`
			<panel id="${this.PANEL_ID}" type="arrow" noautohide="true" align="stretch">
				<vbox id="flexannotate-dialog-container" style="padding: 12px; gap: 8px;">
					<description id="flexannotate-dialog-source"
						style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;"/>

					<vbox id="flexannotate-dialog-group-locator" style="gap: 6px;">
						<hbox align="center" style="gap: 8px;">
							<menulist id="flexannotate-dialog-locator" native="true" style="flex: 1;">
								<menupopup id="flexannotate-dialog-locator-popup"/>
							</menulist>
							<html:input id="flexannotate-dialog-page" type="text"
								style="width: 6em;"/>
						</hbox>
						<checkbox id="flexannotate-dialog-default" native="true"
							data-l10n-id="flexannotate-field-default-locator"/>
					</vbox>

					<hbox id="flexannotate-dialog-group-typecolor" align="center"
						style="gap: 8px;">
						<label data-l10n-id="flexannotate-field-type"
							control="flexannotate-dialog-type"/>
						<menulist id="flexannotate-dialog-type" native="true">
							<menupopup id="flexannotate-dialog-type-popup">
								<menuitem value="highlight"
									data-l10n-id="flexannotate-type-highlight"/>
								<menuitem value="underline"
									data-l10n-id="flexannotate-type-underline"/>
								<menuitem value="note"
									data-l10n-id="flexannotate-type-note"/>
								<menuitem value="text"
									data-l10n-id="flexannotate-type-text"/>
								<menuitem value="image"
									data-l10n-id="flexannotate-type-image"/>
								<menuitem value="ink"
									data-l10n-id="flexannotate-type-ink"/>
							</menupopup>
						</menulist>

						<label data-l10n-id="flexannotate-field-color"
							control="flexannotate-dialog-color"/>
						<menulist id="flexannotate-dialog-color" native="true">
							<menupopup id="flexannotate-dialog-color-popup"/>
						</menulist>
					</hbox>

					<vbox id="flexannotate-dialog-group-text" style="gap: 6px;">
						<label data-l10n-id="flexannotate-field-text"
							control="flexannotate-dialog-text"/>
						<html:textarea id="flexannotate-dialog-text" rows="5"/>
					</vbox>

					<vbox id="flexannotate-dialog-group-comment" style="gap: 6px;">
						<label data-l10n-id="flexannotate-field-comment"
							control="flexannotate-dialog-comment"/>
						<html:textarea id="flexannotate-dialog-comment" rows="3"/>
					</vbox>

					<hbox pack="end" style="gap: 8px; margin-top: 6px;">
						<button id="flexannotate-dialog-cancel"
							data-l10n-id="flexannotate-button-cancel" native="true"/>
						<button id="flexannotate-dialog-accept"
							data-l10n-id="flexannotate-button-save" native="true"
							default="true"/>
					</hbox>
				</vbox>
			</panel>
		`);

		doc.documentElement.appendChild(fragment);
		let panel = doc.getElementById(this.PANEL_ID);
		FlexAnnotate.storeAddedElement(panel);

		this.buildLocatorMenu(doc);
		this.buildColorMenu(doc);

		doc.getElementById('flexannotate-dialog-type')
			.addEventListener('command', () => this.updateTextFieldState(doc));
		doc.getElementById('flexannotate-dialog-cancel')
			.addEventListener('command', () => panel.hidePopup());
		doc.getElementById('flexannotate-dialog-accept')
			.addEventListener('command', () => {
				this.accept(window, panel).catch(e => FlexAnnotate.logError(e));
			});

		let updateDefaultCheckbox = () => {
			let state = panel._flexannotateState;
			let attachment = state?.annotation?.parentItem || (state?.item ? FlexAnnotate.Placeholder.find(state.item) : null);
			let docDefault = FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);
			let chosenLoc = doc.getElementById('flexannotate-dialog-locator').value;
			let defaultCheckbox = doc.getElementById('flexannotate-dialog-default');
			if (defaultCheckbox) {
				if (docDefault === chosenLoc && docDefault !== FlexAnnotate.PrintAnnotations.DEFAULT_LOCATOR) {
					defaultCheckbox.checked = true;
					defaultCheckbox.disabled = true;
				}
				else {
					defaultCheckbox.checked = false;
					defaultCheckbox.disabled = false;
				}
			}
		};
		doc.getElementById('flexannotate-dialog-locator')
			.addEventListener('command', updateDefaultCheckbox);

		panel.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				panel.hidePopup();
				return;
			}

			if (event.key === 'Tab') {
				let focusables = this.getFocusableElements(panel);
				if (!focusables.length) {
					return;
				}
				let doc = panel.ownerDocument;
				let activeEl = doc.activeElement;
				let currentIndex = focusables.indexOf(activeEl);
				if (currentIndex === -1) {
					currentIndex = focusables.findIndex(el => el.contains(activeEl));
				}

				let nextIndex;
				if (event.shiftKey) {
					nextIndex = currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
				}
				else {
					nextIndex = (currentIndex === -1 || currentIndex >= focusables.length - 1) ? 0 : currentIndex + 1;
				}

				event.preventDefault();
				event.stopPropagation();
				let target = focusables[nextIndex];
				if (target) {
					target.focus();
					if (typeof target.select === 'function') {
						target.select();
					}
				}
				return;
			}

			if (event.key === 'Enter') {
				// Menüauswahl in geöffnetem Dropdown nicht vorzeitig als Speichern abfangen
				if (event.target?.closest?.('menupopup')) {
					return;
				}

				let doc = panel.ownerDocument;
				let activeEl = doc.activeElement;
				let isTextarea = activeEl && activeEl.tagName?.toLowerCase().endsWith('textarea');

				// In mehrzeiligen Textfeldern erzeugt Enter normale Zeilenumbrüche;
				// Strg+Enter / Cmd+Enter speichert auch dort.
				if (isTextarea && !event.ctrlKey && !event.metaKey) {
					return;
				}

				// Wenn "Abbrechen" fokussiert ist, schließt Enter das Fenster
				if (activeEl?.id === 'flexannotate-dialog-cancel') {
					event.preventDefault();
					event.stopPropagation();
					panel.hidePopup();
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				this.accept(window, panel).catch(e => FlexAnnotate.logError(e));
			}
		}, true);

		return panel;
	},

	/**
	 * Liefert alle sichtbaren und aktivierten fokussierbaren Elemente des Panels in DOM-Reihenfolge.
	 *
	 * @param {Element} panel
	 * @return {Element[]}
	 */
	getFocusableElements(panel) {
		let candidates = Array.from(panel.querySelectorAll('menulist, input, html\\:input, textarea, html\\:textarea, checkbox, button'));
		return candidates.filter(el => {
			if (el.disabled || el.hidden) {
				return false;
			}
			let cur = el;
			while (cur && cur !== panel) {
				if (cur.hidden || cur.style?.display === 'none') {
					return false;
				}
				cur = cur.parentElement;
			}
			return true;
		});
	},

	/**
	 * Muss vor build() laufen.
	 *
	 * getLocatorString() liest Object.keys(Zotero.Styles.locales) (cite.js:52-55). Vor dem
	 * Ende von Zotero.Styles.init() ist `locales` undefined, der Aufruf wirft, und weil
	 * build() das Panel da schon eingehängt hat, bliebe die Locator-Liste bis zum nächsten
	 * Zotero-Start leer — build() liefert beim zweiten Aufruf das bestehende Panel zurück.
	 * Deshalb wird gewartet, statt den Fehler abzufangen.
	 *
	 * init() gibt eine bereits laufende Initialisierung als Promise zurück
	 * (style.js:70-77) und ist damit beliebig oft aufrufbar.
	 *
	 * @return {Promise<void>}
	 */
	async ensureLocatorsReady() {
		await Zotero.Styles.init();
	},

	/**
	 * Locator-Typen aus Zoteros eigener Liste (Zotero.Cite.labels), beschriftet über
	 * getLocatorString() und alphabetisch sortiert — wie im Zitationsdialog
	 * (integration/citationDialog/popupHandler.mjs:132-146).
	 *
	 * @param {Document} doc
	 */
	buildLocatorMenu(doc) {
		let popup = doc.getElementById('flexannotate-dialog-locator-popup');
		let locators = Zotero.Cite.labels.map(locator => ({
			value: locator,
			// getLocatorString() legt seine Locale-Map an, bevor es sie füllt
			// (cite.js:66-67): bricht das Füllen ab, kommt undefined zurück, und ohne
			// Rückfall würde das Sortieren darauf werfen — das Menü bliebe dann bis zum
			// nächsten Zotero-Start leer, weil build() das Panel weiterreicht.
			label: Zotero.Cite.getLocatorString(locator) || locator
		}));
		locators.sort((a, b) => a.label.localeCompare(b.label));

		for (let { value, label } of locators) {
			let menuitem = doc.createXULElement('menuitem');
			menuitem.setAttribute('value', value);
			menuitem.setAttribute('label', label);
			popup.appendChild(menuitem);
		}
	},

	/**
	 * Farbauswahl aus Zoteros Palette (Zotero.Annotations.COLORS).
	 *
	 * Die Namen kommen über Zotero.getString(), nicht über data-l10n-id: Die Einträge
	 * der Palette sind reine Fluent-Wertnachrichten (general-yellow = Gelb), und Fluent
	 * setzt die als textContent — ein XUL-<menuitem> zeigt aber das label-Attribut, das
	 * dabei leer bliebe. Zotero macht es an gleicher Stelle genauso
	 * (elements/zoteroSearch.js:1269).
	 *
	 * @param {Document} doc
	 */
	buildColorMenu(doc) {
		let popup = doc.getElementById('flexannotate-dialog-color-popup');

		for (let [nameKey, hex] of Zotero.Annotations.COLORS) {
			let menuitem = doc.createXULElement('menuitem');
			menuitem.setAttribute('value', hex);
			menuitem.setAttribute('label', Zotero.getString(nameKey));
			popup.appendChild(menuitem);
		}
	},

	/**
	 * Zotero erlaubt `annotationText` nur bei highlight/underline (item.js:4507),
	 * daher wird das Zitatfeld bei allen anderen Typen gesperrt.
	 *
	 * @param {Document} doc
	 */
	updateTextFieldState(doc) {
		let type = doc.getElementById('flexannotate-dialog-type').value;
		let textField = doc.getElementById('flexannotate-dialog-text');
		let supportsText = ['highlight', 'underline'].includes(type);

		textField.disabled = !supportsText;
		textField.style.opacity = supportsText ? '1' : '0.5';
	},

	/**
	 * @param {Window} window
	 * @param {Element} panel
	 * @return {Promise<void>}
	 */
	async accept(window, panel) {
		let doc = window.document;
		let state = panel._flexannotateState;
		let view = state.view;
		let multi = state.annotations.length > 1;
		let data = {};

		if (view !== 'comment') {
			data.locator = doc.getElementById('flexannotate-dialog-locator').value;
			if (!multi) {
				let pageField = doc.getElementById('flexannotate-dialog-page');
				let page = pageField.value.trim();
				if (!page && state.requirePage) {
					pageField.focus();
					return;
				}
				data.pageLabel = page;
			}
		}
		if (view === 'full') {
			data.type = doc.getElementById('flexannotate-dialog-type').value;
			data.color = doc.getElementById('flexannotate-dialog-color').value;
			data.text = doc.getElementById('flexannotate-dialog-text').value.trim();
		}
		if (view === 'full' || view === 'comment') {
			data.comment = doc.getElementById('flexannotate-dialog-comment').value.trim();
		}
		let defaultCheckbox = doc.getElementById('flexannotate-dialog-default');
		let makeDefault = view !== 'comment'
			&& defaultCheckbox
			&& defaultCheckbox.checked
			&& !defaultCheckbox.disabled;

		panel.hidePopup();

		try {
			if (state.mode === 'edit') {
				// Zuerst den Dokument-Standard: applyLocatorTag() prüft beim Setzen des
				// Annotations-Tags gegen ihn.
				if (makeDefault) {
					await FlexAnnotate.PrintAnnotations.setDefaultLocator(
						state.annotation.parentItem, data.locator
					);
				}
				for (let annotation of state.annotations) {
					await FlexAnnotate.PrintAnnotations.update(annotation, data);
				}
			}
			else {
				if (makeDefault) {
					let attachment = await FlexAnnotate.Placeholder.ensure(state.item);
					await FlexAnnotate.PrintAnnotations.setDefaultLocator(
						attachment, data.locator
					);
				}
				await FlexAnnotate.PrintAnnotations.create(state.item, data);
			}
			FlexAnnotate.ReaderMenu?.updateAllReaders?.();
		}
		catch (e) {
			FlexAnnotate.logError(e);
			// Der Rohtext der Ausnahme ist nicht übersetzt und für Lesende nutzlos; er
			// steht bereits im Debug-Log. Nur als Ersatz, solange keine L10n bereitsteht.
			Zotero.alert(
				window,
				'FlexAnnotate',
				await FlexAnnotate.getString('flexannotate-save-failed', String(e))
			);
		}
	}
};
