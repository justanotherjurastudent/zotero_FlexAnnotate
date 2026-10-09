"use strict";

/**
 * Reader-Integration (Dokumentenansicht).
 *
 * Zwei Hauptfunktionen:
 * 1. Kontextmenü an Annotationen:
 *    Einträge für „Kommentar hinzufügen…“ / „Kommentar bearbeiten…“ und „Locator festlegen…“.
 *    Registriert über Zotero.Reader.registerEventListener('createAnnotationContextMenu', …).
 *
 * 2. „Seitenzahl bearbeiten…“-Popup (.label-popup):
 *    Erweitert Zoteros natives Popup zur Bearbeitung der Seitenzahl um eine Auswahl des
 *    CSL-Locators (Seite, Randnummer, Absatz, Paragraf …) sowie ein Kontrollkästchen,
 *    um diesen Locator künftig als Standard für das Dokument zu setzen.
 */
FlexAnnotate.ReaderMenu = {
	EVENT: 'createAnnotationContextMenu',

	_handler: null,
	_headerHandler: null,
	_notifierID: null,
	_watchedReaders: new WeakSet(),
	_observers: new Set(),
	_origOpen: null,
	_updatingLocators: false,

	/**
	 * Initialisiert die Reader-Erweiterungen.
	 *
	 * @return {Boolean} true, wenn erfolgreich
	 */
	patch() {
		if (this._handler) {
			return true;
		}
		if (typeof Zotero.Reader?.registerEventListener !== 'function') {
			Zotero.warn("FlexAnnotate: Zotero.Reader.registerEventListener not found");
			return false;
		}

		// 1. Kontextmenü-Handler für Annotationen im Reader
		this._handler = (event) => {
			try {
				this.onContextMenu(event);
			}
			catch (e) {
				FlexAnnotate.logError(e);
			}
		};
		Zotero.Reader.registerEventListener(this.EVENT, this._handler, FlexAnnotate.id);

		// 2. Sidebar-Header-Handler: Passt „Seite“ an den gewählten Locator an (z. B. Randnummer)
		this._headerHandler = (event) => {
			try {
				this.onSidebarAnnotationHeader(event);
			}
			catch (e) {
				FlexAnnotate.logError(e);
			}
		};
		Zotero.Reader.registerEventListener('renderSidebarAnnotationHeader', this._headerHandler, FlexAnnotate.id);

		// 3. Item-Änderungen überwachen, um geöffnete Reader sofort zu aktualisieren
		this._notifierID = Zotero.Notifier.registerObserver({
			notify: (event, type, ids, extraData) => {
				try {
					if (type === 'item' && ['modify', 'add', 'trash'].includes(event)) {
						this.updateAllReaders();
						setTimeout(() => this.updateAllReaders(), 100);
					}
				}
				catch (e) {
					FlexAnnotate.logError(e);
				}
			}
		}, ['item'], 'flexannotate-reader');

		// 4. Bestehende und künftige Reader überwachen für den Seitenzahl-Popup
		this.watchAllReaders();

		FlexAnnotate.log("Registered reader context menu, sidebar header listener and label popup watcher");
		return true;
	},

	/**
	 * Entfernt die Reader-Erweiterungen und setzt geöffnete Reader sauber zurück.
	 */
	unpatch() {
		if (this._handler) {
			Zotero.Reader?.unregisterEventListener?.(this.EVENT, this._handler);
			this._handler = null;
		}
		if (this._headerHandler) {
			Zotero.Reader?.unregisterEventListener?.('renderSidebarAnnotationHeader', this._headerHandler);
			this._headerHandler = null;
		}
		if (this._notifierID) {
			Zotero.Notifier?.unregisterObserver?.(this._notifierID);
			this._notifierID = null;
		}
		if (this._origOpen && Zotero.Reader) {
			Zotero.Reader.open = this._origOpen;
			this._origOpen = null;
		}
		for (let obs of this._observers) {
			try {
				obs.disconnect();
			}
			catch (e) {
				FlexAnnotate.logError(e);
			}
		}
		this._observers.clear();

		// Offene Reader zurücksetzen: UI-Elemente entfernen und Label auf Zotero-Standard zurücksetzen
		let defaultLabel = Zotero.Cite?.getLocatorString?.('page') || 'Seite';
		if (Array.isArray(Zotero.Reader?._readers)) {
			for (let reader of Zotero.Reader._readers) {
				let doc = reader._iframeWindow?.document;
				if (doc) {
					try {
						doc.querySelectorAll('.flexannotate-locator-section').forEach(el => el.remove());
						let pageElements = doc.querySelectorAll('.page[id^="page_"]');
						for (let pageEl of pageElements) {
							if (pageEl.firstElementChild) {
								pageEl.firstElementChild.textContent = defaultLabel;
							}
						}
					}
					catch (e) {
						FlexAnnotate.logError(e);
					}
				}
			}
		}
	},

	//
	// 1. Annotations-Kontextmenü
	//

	/**
	 * @param {Object} event - `{ reader, params, append }`
	 */
	onContextMenu(event) {
		let { reader, params, append } = event;
		let itemID = reader?.itemID;
		let annotationIds = params?.ids || [];
		if (!itemID || !annotationIds.length) {
			return;
		}

		let isGerman = (Zotero.locale || '').startsWith('de');
		let hasComment = false;
		if (annotationIds.length === 1 && reader._state?.annotations) {
			let a = reader._state.annotations.find(x => x.id === annotationIds[0]);
			hasComment = !!(a && a.comment && a.comment.trim());
		}

		let commentLabel = isGerman
			? (hasComment ? 'Kommentar bearbeiten…' : 'Kommentar hinzufügen…')
			: (hasComment ? 'Edit Comment…' : 'Add Comment…');
		let locatorLabel = isGerman ? 'Locator festlegen…' : 'Set Locator…';

		let items = [];
		if (annotationIds.length === 1) {
			items.push({
				label: commentLabel,
				persistent: true,
				onCommand: () => this.openDialog(reader, annotationIds, 'comment')
			});
		}
		items.push({
			label: locatorLabel,
			persistent: true,
			onCommand: () => this.openDialog(reader, annotationIds, 'locator')
		});

		append(...items);
	},

	/**
	 * Öffnet die Maske zur Bearbeitung von Kommentar oder Locator.
	 *
	 * @param {Object} reader
	 * @param {String[]} annotationKeys
	 * @param {String} view - 'comment' | 'locator'
	 */
	async openDialog(reader, annotationKeys, view) {
		try {
			let attachment = Zotero.Items.get(reader.itemID);
			if (!attachment) {
				return;
			}
			let annotations = attachment.getAnnotations().filter(a => annotationKeys.includes(a.key));
			if (!annotations.length) {
				annotations = annotationKeys
					.map(key => Zotero.Items.getByLibraryAndKey(attachment.libraryID, key))
					.filter(Boolean);
			}
			if (!annotations.length) {
				return;
			}
			let win = reader._window || Zotero.getMainWindow();
			await FlexAnnotate.Dialog.openForEdit(win, annotations, { view });
		}
		catch (e) {
			FlexAnnotate.logError(e);
		}
	},

	//
	// 2. Seitenzahl-Popup (.label-popup) Erweiterung
	//

	/**
	 * Überwacht alle Reader-Instanzen (aktuelle und künftige).
	 */
	watchAllReaders() {
		if (Array.isArray(Zotero.Reader?._readers)) {
			for (let reader of Zotero.Reader._readers) {
				this.watchReader(reader);
			}
		}

		if (!this._origOpen && typeof Zotero.Reader?.open === 'function') {
			let self = this;
			this._origOpen = Zotero.Reader.open;
			Zotero.Reader.open = async function (...args) {
				let reader = await self._origOpen.apply(this, args);
				if (reader) {
					self.watchReader(reader);
				}
				return reader;
			};
		}
	},

	/**
	 * @param {Object} reader
	 */
	watchReader(reader) {
		if (!reader || this._watchedReaders.has(reader)) {
			return;
		}
		this._watchedReaders.add(reader);

		let pollForIframe = (attempts = 0) => {
			if (reader._isTabClosed || attempts > 60) {
				return;
			}
			let win = reader._iframeWindow;
			if (win && win.document && win.document.body) {
				this.attachObserver(reader, win);
			}
			else {
				setTimeout(() => pollForIframe(attempts + 1), 250);
			}
		};
		pollForIframe();
	},

	/**
	 * Hängt einen MutationObserver an das Dokument des Reader-iFrames.
	 *
	 * @param {Object} reader
	 * @param {Window} iframeWin
	 */
	attachObserver(reader, iframeWin) {
		let doc = iframeWin.document;
		let observer = new iframeWin.MutationObserver((mutations) => {
			if (this._updatingLocators) {
				return;
			}
			try {
				let hasPageOrCard = false;
				for (let mutation of mutations) {
					for (let node of mutation.addedNodes) {
						if (node.nodeType === 1) {
							let popup = node.classList?.contains('label-popup')
								? node
								: node.querySelector?.('.label-popup');
							if (popup) {
								this.enhanceLabelPopup(reader, popup);
							}
							if (node.classList?.contains('page') || node.querySelector?.('.page')
								|| node.classList?.contains('preview') || node.querySelector?.('.preview')
								|| node.classList?.contains('annotation') || node.querySelector?.('.annotation')) {
								hasPageOrCard = true;
							}
						}
					}
				}
				if (hasPageOrCard) {
					this.updateAllLocators(reader, doc);
				}
			}
			catch (e) {
				FlexAnnotate.logError(e);
			}
		});

		this._observers.add(observer);
		observer.observe(doc.body, { childList: true, subtree: true });

		// Initiale Lokalisierung bereits dargestellter Annotationen
		this.updateAllLocators(reader, doc);
	},

	/**
	 * Fügt die Locator-Auswahl und die Standard-Checkbox in Zoteros Seitenzahl-Popup ein.
	 *
	 * @param {Object} reader
	 * @param {Element} popup - Der .label-popup Knoten
	 */
	enhanceLabelPopup(reader, popup) {
		if (popup.querySelector('.flexannotate-locator-section')) {
			return;
		}

		let attachment = Zotero.Items.get(reader.itemID);
		if (!attachment) {
			return;
		}

		let currentKey = reader._state?.labelPopup?.currentAnnotation?.id;
		let currentAnnotation = currentKey
			? (attachment.getAnnotations().find(a => a.key === currentKey)
			   || Zotero.Items.getByLibraryAndKey(attachment.libraryID, currentKey))
			: null;

		let currentLocator = currentAnnotation
			? FlexAnnotate.PrintAnnotations.getLocator(currentAnnotation)
			: FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);

		let doc = popup.ownerDocument;
		let isGerman = (Zotero.locale || '').startsWith('de');

		let container = doc.createElement('div');
		container.className = 'row flexannotate-locator-section';
		container.style.cssText = 'margin: 8px 0; display: flex; flex-direction: column; gap: 6px;';

		let rowTop = doc.createElement('div');
		rowTop.style.cssText = 'display: flex; align-items: center; gap: 8px;';

		let label = doc.createElement('label');
		label.textContent = 'Locator:';
		label.style.cssText = 'font-weight: bold; font-size: 12px; min-width: 50px;';

		let select = doc.createElement('select');
		select.className = 'toolbarField flexannotate-locator-select';
		select.style.cssText = 'flex: 1; padding: 2px 6px; font-size: 12px; border-radius: 4px; border: 1px solid var(--material-panedivider, #ccc); background: var(--material-background, #fff); color: inherit;';

		let locators = Zotero.Cite.labels.map(loc => ({
			value: loc,
			label: Zotero.Cite.getLocatorString(loc) || loc
		}));
		locators.sort((a, b) => a.label.localeCompare(b.label));

		for (let { value, label: locLabel } of locators) {
			let opt = doc.createElement('option');
			opt.value = value;
			opt.textContent = locLabel;
			if (value === currentLocator) {
				opt.selected = true;
			}
			select.appendChild(opt);
		}
		rowTop.appendChild(label);
		rowTop.appendChild(select);

		let rowBottom = doc.createElement('div');
		rowBottom.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 2px;';

		let checkbox = doc.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.id = 'flexannotate-default-locator-check';
		checkbox.style.cssText = 'margin: 0;';

		let docDefault = FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);

		let updateCheckboxState = () => {
			let currentVal = select.value;
			if (currentVal === docDefault && docDefault !== FlexAnnotate.PrintAnnotations.DEFAULT_LOCATOR) {
				checkbox.checked = true;
				checkbox.disabled = true;
				checkLabel.textContent = isGerman
					? 'Ist bereits Standard für dieses Dokument'
					: 'Already default for this document';
			}
			else {
				checkbox.disabled = false;
				checkbox.checked = false;
				checkLabel.textContent = isGerman
					? 'Diesen Locator künftig für dieses Dokument verwenden'
					: 'Use this locator by default for this document';
			}
		};

		let checkLabel = doc.createElement('label');
		checkLabel.htmlFor = 'flexannotate-default-locator-check';
		checkLabel.style.cssText = 'font-size: 11px; cursor: pointer; user-select: none;';

		rowBottom.appendChild(checkbox);
		rowBottom.appendChild(checkLabel);

		container.appendChild(rowTop);
		container.appendChild(rowBottom);

		// Vor den Radio-Buttons oder vor den Buttons einhängen
		let fieldset = popup.querySelector('fieldset.radio');
		if (fieldset) {
			fieldset.before(container);
			let legend = fieldset.querySelector('legend');
			if (legend) {
				legend.textContent = isGerman ? 'Locator und Nummerierung ändern:' : 'Edit locator and numbering:';
			}
		}
		else {
			let buttons = popup.querySelector('.row.buttons');
			if (buttons) {
				buttons.before(container);
			}
			else {
				popup.appendChild(container);
			}
		}

		// Radio-Buttons im Popup steuern:
		// Standardmäßig "Diese Annotation" (single) bzw. "Ausgewählte Annotationen" (selected) wählen,
		// damit Zotero nicht fälschlicherweise "Diese Seite und folgende Seiten" (from) ausführt.
		let selectPreferredRadio = () => {
			let preferredRadio = popup.querySelector('input[name="renumber"][value="single"]')
				|| popup.querySelector('input[name="renumber"][value="selected"]');
			if (preferredRadio && !preferredRadio.checked) {
				preferredRadio.click();
			}
		};

		let autoDetectCol = popup.querySelector('.row.label .column.second')
			|| popup.querySelector('#renumber-auto-detect')?.parentElement;
		let autoLabel = popup.querySelector('label[for="renumber-auto-detect"]');
		let origAutoLabel = autoLabel?.textContent || (isGerman ? 'Automatisch erkennen' : 'Auto-detect');

		// Wenn der Locator nicht 'page' ist (z. B. Randnummer), machen lineare Seitendifferenzen
		// ('from' oder 'all') sowie Zoteros "Automatisch erkennen" keinen Sinn und müssen deaktiviert werden.
		let updateRadioVisibility = () => {
			let isPage = select.value === 'page';
			let fromRadio = popup.querySelector('input[name="renumber"][value="from"]');
			let allRadio = popup.querySelector('input[name="renumber"][value="all"]');

			// "Automatisch erkennen" ist Zoteros native Funktion, um Seitenzahlen aus der
			// physischen PDF-Seitenzahl abzuleiten. Bei Randnummern zerstört sie die Zählung!
			if (autoDetectCol) {
				autoDetectCol.style.display = isPage ? '' : 'none';
			}
			if (autoLabel) {
				autoLabel.textContent = origAutoLabel;
			}
			let autoCheck = popup.querySelector('#renumber-auto-detect');
			if (!isPage && autoCheck && autoCheck.checked) {
				autoCheck.click();
			}

			if (!isPage) {
				if (fromRadio) {
					fromRadio.disabled = true;
					let parent = fromRadio.closest('label') || fromRadio.parentElement;
					if (parent) {
						parent.style.opacity = '0.4';
						parent.style.pointerEvents = 'none';
					}
				}
				if (allRadio) {
					allRadio.disabled = true;
					let parent = allRadio.closest('label') || allRadio.parentElement;
					if (parent) {
						parent.style.opacity = '0.4';
						parent.style.pointerEvents = 'none';
					}
				}
				let checked = popup.querySelector('input[name="renumber"]:checked');
				if (checked && (checked.value === 'from' || checked.value === 'all')) {
					selectPreferredRadio();
				}
			}
			else {
				if (fromRadio) {
					fromRadio.disabled = false;
					let parent = fromRadio.closest('label') || fromRadio.parentElement;
					if (parent) {
						parent.style.opacity = '';
						parent.style.pointerEvents = '';
					}
				}
				if (allRadio) {
					allRadio.disabled = false;
					let parent = allRadio.closest('label') || allRadio.parentElement;
					if (parent) {
						parent.style.opacity = '';
						parent.style.pointerEvents = '';
					}
				}
			}
		};

		select.addEventListener('change', () => {
			updateCheckboxState();
			updateRadioVisibility();
		});

		updateCheckboxState();
		selectPreferredRadio();
		updateRadioVisibility();

		setTimeout(() => {
			selectPreferredRadio();
			updateRadioVisibility();
		}, 0);
		setTimeout(() => {
			selectPreferredRadio();
			updateRadioVisibility();
		}, 50);

		// Bei Klick auf „Aktualisieren“ oder Enter Locator-Daten anwenden
		let applied = false;
		let onApply = async () => {
			if (applied) {
				return;
			}
			try {
				let chosenLocator = select.value;
				let makeDefault = checkbox.checked && !checkbox.disabled;

				let key = reader._state?.labelPopup?.currentAnnotation?.id || currentKey;
				let currentAnn = key
					? (attachment.getAnnotations().find(a => a.key === key)
					   || Zotero.Items.getByLibraryAndKey(attachment.libraryID, key))
					: currentAnnotation;

				let currentLocator = currentAnn ? FlexAnnotate.PrintAnnotations.getLocator(currentAnn) : null;
				let currentDefault = FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);

				let locatorChanged = (chosenLocator !== currentLocator);
				let defaultChanged = makeDefault && (chosenLocator !== currentDefault);

				// Wenn sich weder der Locator noch die Dokumentvorgabe geändert hat,
				// greift FlexAnnotate nicht ein: Zoteros native Handler aktualisieren die
				// Seitenzahl völlig konfliktfrei ohne SQLite-Rennbedingungen.
				if (!locatorChanged && !defaultChanged) {
					return;
				}

				applied = true;

				if (defaultChanged) {
					await FlexAnnotate.PrintAnnotations.setDefaultLocator(attachment, chosenLocator, currentAnn?.key);
				}

				let checkedRadio = popup.querySelector('input[name="renumber"]:checked')?.value || 'single';
				let targetItems = [];

				if (checkedRadio === 'single') {
					if (currentAnn) {
						targetItems = [currentAnn];
					}
				}
				else if (checkedRadio === 'selected') {
					let selectedKeys = reader._state?.labelPopup?.selectedIDs || [];
					targetItems = attachment.getAnnotations().filter(a => selectedKeys.includes(a.key));
					if (!targetItems.length && currentAnn) {
						targetItems = [currentAnn];
					}
				}
				else if (checkedRadio === 'page') {
					let pageIndex = reader._state?.labelPopup?.currentAnnotation?.position?.pageIndex;
					targetItems = attachment.getAnnotations().filter(a => {
						try {
							let pos = JSON.parse(a.annotationPosition);
							return pos?.pageIndex === pageIndex;
						}
						catch {
							return false;
						}
					});
				}
				else if (checkedRadio === 'from') {
					if (chosenLocator === 'page') {
						let pageIndex = reader._state?.labelPopup?.currentAnnotation?.position?.pageIndex;
						if (pageIndex !== undefined) {
							targetItems = attachment.getAnnotations().filter(a => {
								try {
									let pos = JSON.parse(a.annotationPosition);
									return typeof pos?.pageIndex === 'number' && pos.pageIndex >= pageIndex;
								}
								catch {
									return false;
								}
							});
						}
						else {
							targetItems = currentAnn ? [currentAnn] : [];
						}
					}
					else {
						targetItems = currentAnn ? [currentAnn] : [];
					}
				}
				else if (checkedRadio === 'all') {
					if (chosenLocator === 'page') {
						targetItems = attachment.getAnnotations();
					}
					else {
						targetItems = currentAnn ? [currentAnn] : [];
					}
				}
				else {
					targetItems = currentAnn ? [currentAnn] : [];
				}

				let am = this.getAnnotationManager(reader);
				let pageInput = popup.querySelector('input.toolbarField, input[type="text"]');
				let newPageLabel = pageInput?.value?.trim();

				let tagPrefix = FlexAnnotate.PrintAnnotations.LOCATOR_TAG_PREFIX;
				let docDefault = defaultChanged ? chosenLocator : FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);

				if (am) {
					// 1. Primärer Weg: Über Zoteros AnnotationManager im Reader aktualisieren.
					// Dadurch verwaltet Zotero die Tags im Speicher und speichert sie atomar
					// zusammen mit der neuen Seitenzahl über onSaveAnnotations (saveFromJSON).
					let amUpdates = [];
					for (let targetAnn of targetItems) {
						let annKey = targetAnn.key || targetAnn.id;
						let existing = am._getAnnotationByID(annKey);
						if (existing) {
							let newTags = (existing.tags || []).filter(t => {
								let name = typeof t === 'string' ? t : (t?.name || t?.tag || '');
								return !name.startsWith(tagPrefix);
							});
							if (chosenLocator && (chosenLocator !== 'page' || docDefault !== 'page')) {
								newTags.push({ name: tagPrefix + chosenLocator });
							}
							let updateObj = { id: existing.id, tags: newTags };
							if (newPageLabel && (targetItems.length === 1 || checkedRadio === 'single')) {
								updateObj.pageLabel = newPageLabel;
							}
							amUpdates.push(updateObj);
						}
						// Auch das Zotero.Item im Speicher des Hauptprozesses taggen
						FlexAnnotate.PrintAnnotations.applyLocatorTag(targetAnn, chosenLocator);
					}
					if (amUpdates.length) {
						am.updateAnnotations(amUpdates);
					}
				}
				else {
					// 2. Fallback: Direktes Speichern auf Zotero.Item
					for (let ann of targetItems) {
						FlexAnnotate.PrintAnnotations.applyLocatorTag(ann, chosenLocator);
						if (newPageLabel && (targetItems.length === 1 || checkedRadio === 'single')) {
							ann.annotationPageLabel = newPageLabel;
						}
						await ann.saveTx();
					}
				}

				// Sofortige visuelle Aktualisierung im Reader
				this.updateAllLocators(reader, doc);
				this.updateAllReaders();
			}
			catch (e) {
				FlexAnnotate.logError(e);
			}
		};

		// Klick auf „Aktualisieren“ abfangen (Event-Delegation auf popup, damit auch nach Re-Renders aktiv)
		popup.addEventListener('click', (event) => {
			if (event.target.closest('.row.buttons button')) {
				onApply();
			}
		}, true);

		// Enter-Taste behandeln
		popup.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				let pageInput = popup.querySelector('input.toolbarField, input[type="text"]');
				onApply();

				// Wenn der Benutzer NICHT im Textfeld steht (z. B. auf Locator-Select oder Checkbox),
				// Klick auf Aktualisieren-Button auslösen
				if (event.target !== pageInput) {
					event.preventDefault();
					event.stopPropagation();
					let btn = popup.querySelector('.row.buttons button.primary, .row.buttons button');
					if (btn && !btn.disabled) {
						btn.click();
					}
				}
				// Wenn der Benutzer im Textfeld steht:
				// KEIN preventDefault / stopPropagation!
				// Zoteros React-Handler onKeyDown={handleInputKeydown} übernimmt das native
				// Aktualisieren und Schließen des Popups.
			}
		}, true);
	},

	/**
	 * Liefert den AnnotationManager des Readers (sofern verfügbar).
	 *
	 * @param {Object} reader
	 * @return {Object|null}
	 */
	getAnnotationManager(reader) {
		try {
			return reader?._internalReader?._annotationManager
				|| reader?._iframeWindow?.wrappedJSObject?._reader?._annotationManager
				|| reader?._iframeWindow?._reader?._annotationManager
				|| reader?._annotationManager
				|| null;
		}
		catch {
			return null;
		}
	},

	/**
	 * Ermittelt das Zotero.Item einer Annotation.
	 *
	 * @param {Object} reader
	 * @param {String} key
	 * @return {Zotero.Item|null}
	 */
	getAnnotationItem(reader, key) {
		if (!reader?.itemID || !key) {
			return null;
		}
		let attachment = Zotero.Items.get(reader.itemID);
		if (!attachment) {
			return null;
		}
		let anns = attachment.getAnnotations();
		let item = anns.find(a => a.key === key);
		if (!item) {
			item = Zotero.Items.getByLibraryAndKey(attachment.libraryID, key);
		}
		return item || null;
	},

	/**
	 * Ermittelt den CSL-Locator einer Annotation (z. B. 'opus', 'paragraph', 'page').
	 *
	 * @param {Object} reader
	 * @param {String|Object} keyOrAnnotation
	 * @return {String}
	 */
	getAnnotationLocator(reader, keyOrAnnotation) {
		let key = typeof keyOrAnnotation === 'string'
			? keyOrAnnotation
			: (keyOrAnnotation?.id || keyOrAnnotation?.key);

		// Erst im Reader-Speicher (AnnotationManager / reader._state) prüfen,
		// da dieser bei Änderungen sofort aktuell ist (bevor Zotero asynchron auf die DB schreibt)
		let am = this.getAnnotationManager(reader);
		let readerAnn = (am && key ? am._getAnnotationByID(key) : null)
			|| (typeof keyOrAnnotation === 'object' ? keyOrAnnotation : null)
			|| (reader?._state?.annotations && key ? reader._state.annotations.find(a => a.id === key) : null);

		let tags = readerAnn?.tags || [];
		for (let t of tags) {
			let name = typeof t === 'string' ? t : (t?.name || t?.tag || '');
			if (name.startsWith(FlexAnnotate.PrintAnnotations.LOCATOR_TAG_PREFIX)) {
				let locator = name.slice(FlexAnnotate.PrintAnnotations.LOCATOR_TAG_PREFIX.length);
				if (Zotero.Cite?.labels?.includes(locator) || locator === 'margin') {
					return locator;
				}
			}
		}

		let item = this.getAnnotationItem(reader, key);
		if (item) {
			return FlexAnnotate.PrintAnnotations.getLocator(item);
		}

		let attachment = reader?.itemID ? Zotero.Items.get(reader.itemID) : null;
		return FlexAnnotate.PrintAnnotations.getDefaultLocator(attachment);
	},

	/**
	 * Liefert die benutzerfreundliche Beschriftung eines Locators (z. B. „Randnummer“, „Seite“, „Absatz“).
	 *
	 * @param {String} locator
	 * @return {String}
	 */
	getLocatorLabel(locator) {
		if (!locator || locator === FlexAnnotate.PrintAnnotations.DEFAULT_LOCATOR) {
			return Zotero.Cite?.getLocatorString?.('page') || 'Seite';
		}
		let label = Zotero.Cite?.getLocatorString?.(locator);
		if (label) {
			return label;
		}
		if (locator === 'margin') {
			let isGerman = (Zotero.locale || '').startsWith('de');
			return isGerman ? 'Randnummer' : 'Margin';
		}
		if (locator === 'opus' && !label) {
			let isGerman = (Zotero.locale || '').startsWith('de');
			return isGerman ? 'Randnummer' : 'Opus';
		}
		return locator.charAt(0).toUpperCase() + locator.slice(1);
	},

	/**
	 * Aktualisiert den Locator-Text im Header einer einzelnen Annotation.
	 *
	 * @param {Object} event - `{ reader, doc, params }`
	 */
	onSidebarAnnotationHeader(event) {
		let { reader, doc, params } = event;
		let annId = params?.annotation?.id;
		if (!reader || !doc || !annId) {
			return;
		}
		let locator = this.getAnnotationLocator(reader, annId);
		let labelText = this.getLocatorLabel(locator);
		let pageEl = doc.getElementById('page_' + annId);
		if (pageEl && pageEl.firstElementChild) {
			if (pageEl.firstElementChild.textContent !== labelText) {
				pageEl.firstElementChild.textContent = labelText;
			}
		}
	},

	/**
	 * Aktualisiert alle sichtbaren Annotation-Header (Sidebar und In-Page-Popup) im Reader-Dokument.
	 *
	 * @param {Object} reader
	 * @param {Document} doc
	 */
	updateAllLocators(reader, doc) {
		if (!reader || !doc) {
			return;
		}
		this._updatingLocators = true;
		try {
			let pageElements = doc.querySelectorAll('.page[id^="page_"]');
			for (let pageEl of pageElements) {
				let annId = pageEl.id.slice(5);
				let locator = this.getAnnotationLocator(reader, annId);
				let labelText = this.getLocatorLabel(locator);
				if (pageEl.firstElementChild && pageEl.firstElementChild.textContent !== labelText) {
					pageEl.firstElementChild.textContent = labelText;
				}
			}

			// Auch über .annotation-Karten suchen (falls pageEl ohne id="page_" existiert)
			let annCards = doc.querySelectorAll('.annotation[data-id], .annotation[id]');
			for (let card of annCards) {
				let annId = card.getAttribute('data-id') || card.id;
				let pageEl = card.querySelector('.page');
				if (pageEl && pageEl.firstElementChild) {
					let locator = this.getAnnotationLocator(reader, annId);
					let labelText = this.getLocatorLabel(locator);
					if (pageEl.firstElementChild.textContent !== labelText) {
						pageEl.firstElementChild.textContent = labelText;
					}
				}
			}

			// In-Page-Popup (.annotation-popup) ebenfalls aktualisieren
			let popup = doc.querySelector('.annotation-popup');
			if (popup) {
				let editorNode = popup.querySelector('.editor[id], [data-id]');
				let annId = editorNode?.id || editorNode?.getAttribute('data-id')
					|| reader._state?.primaryViewAnnotationPopup?.annotation?.id
					|| reader._state?.secondaryViewAnnotationPopup?.annotation?.id;
				if (annId) {
					let locator = this.getAnnotationLocator(reader, annId);
					let labelText = this.getLocatorLabel(locator);
					let pageEl = popup.querySelector('.page');
					if (pageEl && pageEl.firstElementChild && pageEl.firstElementChild.textContent !== labelText) {
						pageEl.firstElementChild.textContent = labelText;
					}
				}
			}
		}
		finally {
			this._updatingLocators = false;
		}
	},

	/**
	 * Aktualisiert alle geöffneten Reader.
	 */
	updateAllReaders() {
		if (!Array.isArray(Zotero.Reader?._readers)) {
			return;
		}
		for (let reader of Zotero.Reader._readers) {
			let doc = reader._iframeWindow?.document;
			if (doc) {
				this.updateAllLocators(reader, doc);
			}
		}
	}
};
