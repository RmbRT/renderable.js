/**
 *
 * @licstart  The following is the entire license notice for the 
 *  JavaScript code in this page.
 *
 * Copyright (C) 2019, 2021 – 2024  RmbRT
 *
 *
 * The JavaScript code in this page is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License (GNU GPL) as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.  The code is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
 *
 * As additional permission under GNU GPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * @licend  The above is the entire license notice
 * for the JavaScript code in this page.
 *
 */
'use strict';

console.info("This site is using renderable.js, which is free software; you can view its license and original source code at https://github.com/RmbRT/renderable.js");


(() => {
const isBrowser = typeof global === "undefined";
const hasDom = () => typeof document !== "undefined";
const globalScope = (isBrowser ? window : global);
const declareGlobals = (isBrowser || globalScope.RenderableUseGlobal);

// Ensure the global render namespace exists.
const render = {};
const Renderable =
{
	/** Detect whether an object is a renderable object.
	@param obj:
		The object to check.
	@return
		Whether the object was made renderable using Renderable.enable. */
	isRenderable(obj)
	{
		return obj && ("_renderable" in obj);
	},

	/** Assert that an object is a renderable object.
	@param renderable:
		The object to assert as renderable.
	@throws Error
		If `renderable` is not a renderable object. */
	assertRenderable(renderable)
	{
		if(!Renderable.isRenderable(renderable))
			throw new Error("Non-renderable object passed.");
	},

	/** Adds renderable properties to a renderable object.
		When a renderable property is changed, the associated renderable object is re-rendered. Passing a renderable object as `fields` will share its properties with the extended object. Changes made to the properties will then trigger re-rendering of both objects.
	@param obj:
		The renderable object.
	@param fields:
		An object containing the properties to be added, as well as their initial values. Can be a renderable object. */
	addFields(obj, fields)
	{
		Renderable.assertRenderable(obj);

		if(Renderable.isRenderable(fields))
		{
			obj._renderable.children.push(fields);
			fields._renderable.parents.push(obj);
		}

		const ignore = {render: null, _renderable: null, toString: null};
		for(let name in fields)
		{
			if(name in ignore)
				continue;

			if(!(name in obj))
			{
				obj._renderable.values.push(name);
				Object.defineProperty(obj, name, {
					get: ((name) => { return function(){ return fields[name]; }; })(name),
					set: ((name) => { return function(value)
						{
							if(fields[name] !== value)
							{
								fields[name] = value;
								Renderable.invalidate(this);
							}
						}; })(name)
				});
			} else console.warn(`addFields: Property '${name}' added twice.`);
		}

		if(Renderable.isRenderable(fields))
			for(name of fields._renderable.values)
				Object.defineProperty(obj, name, {
					get: ((name) => { return function(){ return fields[name]; }; })(name),
					set: ((name) => { return function(value){ fields[name] = value; }}),
				});

		return obj;
	},

	/** Makes an object renderable.
	@param obj:
		The object to make renderable.
	@param params:
		An object containing parameters:

		* render:
			A function that generates a HTML representation of the object.
		* anchor:
			Optional: The anchor(s) in the document to render the object into.
			Either an Element, an Element array, or a string. If it is a string, renders into all elements with the name "render.x", where x is the anchor string, and saves the object into the global render.x (again, where x is the anchor string).
		* children:
			Optional: The renderable objects this object uses internally.
			If any of the children is updated, this object will also be updated. Allowed values are either a renderable object, or an array of renderable objects.
	@param trackingId:
		Optional: A unique ID for linking DOM events back to the renderable. */
	enable(obj, params, trackingId)
	{
		if(Renderable.isRenderable(obj))
			throw new Error("Object must not yet be renderable.");

		if(!(params.render instanceof Function))
			throw new Error("Expected 'render' function in params.");

		if(obj.hasOwnProperty("render"))
			throw new Error("Object must not yet have a 'render' function.");
		obj.toString = obj.render = Renderable._internal.render;

		if("anchor" in params)
		{
			if(params.anchor instanceof (globalScope.Element || function(){}))
				params.anchor = [params.anchor];
			else if(typeof params.anchor === 'string')
			{
				if(params.anchor in render)
					throw new Error("Duplicate renderable detected!");
				
				render[params.anchor] = obj;
			}
		}

		obj._renderable =
		{
			values: [],
			locked: 0,
			dirty: true,
			anchor: params.anchor || [],
			children: [], // Overwritten each rendering: child renderables.
			parents: [],
			render: params.render,
			cache: null,
			cache_final: null,
			rendering: false,
			events: params.events || {},
			constructing: true
		};

		// transitive anchor tracking throughout the parents.
		obj._renderable.has_anchor = obj._renderable.anchor.length != 0;

		let renderstack = Renderable._internal.renderstack;
		if(renderstack.length){
			obj._renderable.has_anchor ||= renderstack[renderstack.length-1]._renderable.has_anchor;
		}

		// Activate all necessary events.
		Renderable.listenForEvents(Object.keys(obj._renderable.events));

		if(trackingId !== undefined) {
			obj._renderable.id = trackingId;
			Renderable._internal.uniqueRenderables[trackingId] = new WeakRef(obj);
		}

		if("children" in params)
		{
			if(Renderable.isRenderable(params.children))
			{
				obj._renderable.children = [params.children];
				params.children._renderable.parents.push(obj);
			} else if(params.children instanceof Array)
			{
				for(let child of params.children)
				{
					Renderable.assertRenderable(child);
					obj._renderable.children.push(child);
					child._renderable.parents.push(obj);
				}
			} else
			{
				throw new Error("Children must be renderable or renderable array!");
			}
		}

		return obj;
	},

	with(renderable, perform)
	{
		Renderable.assertRenderable(renderable);
		Renderable._internal.renderstack.push(renderable);
		let result = perform(renderable);
		Renderable._internal.renderstack.pop();
		return result;
	},

	relay(e, renderable) {
		Renderable.assertRenderable(renderable);
		let handler = renderable._renderable.events[e.type];
		return handler ? handler.call(renderable, {
			...e,
			bubbled: e.target != renderable,
		}) : true;
	},

	fallback(event_type, renderable) {
		if(event_type in Renderable._internal.eventListeners) {
			Renderable._internal.eventListeners[event_type].fallback = renderable;
		}
	},

	/** Creates a new renderable object.
	@param fields:
		An object containing the properties to generate for the renderable object and their initial values.
		All fields in the object are tracked and modification will result in a re-render.
	@param params:
		An object containing parameters:

		* render:
			A function that generates a HTML representation of the object.
		* anchor:
			Optional: The anchor(s) in the document to render the object into.
			Either an Element, an Element array, or a string. If it is a string, renders into all elements with the name "render.x", where x is the anchor string, and saves the object into the global render.x (again, where x is the anchor string).
		* children:
			Optional: The renderable objects this object uses internally.
			If any of the children is updated, this object will also be updated. Allowed values are either a renderable object, or an array of renderable objects.
		* events:
			Optional: Event handlers for DOM events. Only used when calling Renderable.createInteractive().
	@param untracked:
		(Optional) An object containing additional properties of the renderable object and their initial values.
		Fields in this object will not be tracked and modifications will not result in a re-render. */
	create(fields, params, untracked)
	{
		const base = untracked ?? {};
		delete base.render;

		let r = Renderable.addFields(
			Renderable.enable(
				base,
				{ render: untracked?.render, ...params },
				undefined),
			fields);
		Renderable._internal.renderstack.push(r);
		if(typeof params["constructor"] === "function")
			params["constructor"].call(r);
		Renderable._internal.renderstack.pop();
		Renderable.render(r);
		delete r._renderable.constructing;
		return r;
	},

	/** Creates a new renderable object that gives its outermost tags an ID used for linking DOM events back to the renderable. */
	createInteractive: (function() {
		let counter = 0n;
		return function createInteractive(fields, params, untracked) {
			const base = untracked ?? {};
			const proto = Object.getPrototypeOf(base);
			delete base.render;

			if(!params.events) params.events = {};
			Object.getOwnPropertyNames(proto).concat(Object.keys(base)).flatMap(
				x => {
					let event = x.match(/^onDom([A-Z]\w+)/)
					if(!event) return [];
					if(event[1].match(/^[A-Z][a-z]/))
						return [[x, event[1][0].toLowerCase() + event[1].slice(1)]];
					return [[x, event[1]]];
				}).forEach(([k, event]) => params.events[event] = base[k]);
			let r = Renderable.addFields(
				Renderable.enable(
					base,
					{ render: untracked?.render, ...params },
					counter++),
				fields);

			Renderable._internal.renderstack.push(r);
			if(typeof params["constructor"] === "function")
				params["constructor"].call(r);
			Renderable._internal.renderstack.pop();
			Renderable.render(r);
			delete r._renderable.constructing;
			return r;
		};
	})(),

	/** Renders the renderable object into all its anchors and parents.
		Only modifies differing elements in the document, to minimise the amount of re-rendering done by the browser.
	@param renderable:
		The renderable object to render.
	@return
		Whether the renderable object changed its contents since the previous rendering. */
	render(renderable)
	{
		Renderable.assertRenderable(renderable);

		if(Renderable.isLocked(renderable) || !renderable._renderable.dirty)
			return false;

		// Erase all parents, as they may be temporary. They will re-register themselves during their re-render.
		let prev_parents = renderable._renderable.parents;
		if(!renderable._renderable.constructing)
			renderable._renderable.parents = [];

		let out = {};
		const start = globalScope.performance?.now() ?? new Date();
		let html = renderable.render(out);
		if(!out.changed) {
			renderable._renderable.parents = prev_parents;
			return false;
		}

		let anchor = renderable._renderable.anchor;
		if(typeof anchor === 'string')
			anchor = document.getElementsByName("render."+anchor);


		// If the renderable is in the document, render it.
		if(anchor.length)
		{
			var parsed = document.createElement("span");
			parsed.innerHTML = html;
			var copy = anchor.length > 1;

			for(let a of anchor)
				if(html !== a.innerHTML)
					Renderable._internal.replace(parsed, a, copy);
		}
		const end = globalScope.performance?.now() ?? new Date();
		const diff = end - start;
		if(diff > 10)
			console.warn(`Rendered within ${diff}ms`);
	
		if(!renderable._renderable.constructing)
		{
			// notify all previous session's parents, in case they are still using this renderable.
			for(const parent of prev_parents)
				Renderable.invalidate(parent);
		}

		return true;
	},

	/** Checks whether a renderable object is currently locked.
	@param renderable:
		The renderable object to check.
	@return
		Whether `renderable` is locked. */
	isLocked(renderable)
	{
		Renderable.assertRenderable(renderable);
		return renderable._renderable.locked;
	},

	/** Locks a renderable object, so modifications will not trigger a re-render until it is unlocked again.
		Objects can be locked multiple times simultaneously.
	@param renderable:
		The renderable object to lock. */
	lock(renderable)
	{
		Renderable.assertRenderable(renderable);

		if(Renderable.isLocked(renderable))
			throw new Error("Tried to lock locked renderable.");

		++renderable._renderable.locked;
	},

	/** Unlocks a renderable object.
		This removes only one lock. If there are multiple locks on the same renderable object, it has to be unlocked multiple times. When unlock removes the last lock of a renderable object, all changes made to it while it was locked are rendered.
	@param renderable:
		The renderable object to unlock. Must be currently locked. */
	unlock(renderable)
	{
		Renderable.assertRenderable(renderable);
		if(Renderable.isLocked(renderable))
			if(!--renderable._renderable.locked)
				if(!renderable._renderable.constructing && renderable._renderable.dirty)
				{
					Renderable.render(renderable);
				}
	},

	/** Invalidates a renderable object, and triggers a re-render.
		Calls Renderable.render, and if it returns true, then all parents are invalidated as well. This function is called automatically whenever a renderable property is changed. If a renderable object has unregistered properties, this function has to be called manually after each modification of those properties.
	@param renderable:
		The renderable object to invalidate. */
	invalidate(renderable)
	{
		Renderable.assertRenderable(renderable);
		if(renderable._renderable.constructing)
			return;

		renderable._renderable.dirty = true;
		if(Renderable.isLocked(renderable))
			return;

		// No need to notify anything if we have no anchors to write to. We can still manually render top-down using renderable.render().
		if(renderable._renderable.has_anchor)
		{
			// Temporarily reset so that one-shot child renderables do no longer count as anchored on their second use.
			renderable._renderable.has_anchor = renderable._renderable.anchor.length != 0 || renderable._renderable.parents.some(p => p._renderable.has_anchor);
			Renderable.render(renderable);
		} else
			// Even if currently unanchored, at least mark parents as dirty, in case the anchor is restored later. Parents are detached from children before rendering, so all still linked parents have not discarded this renderable since it was last rendered. Invalidating parents will not cause a re-render if the entire tree is unanchored.
			// TODO: figure out whether this leaks interactive parents, and figure out why this is even necessary.
			renderable._renderable.parents.forEach(Renderable.invalidate);
	},

	_internal:
	{
		specialAttrs: (() => {
			const boolAttr = (name) => (e) => {
				const v = e.getAttribute(name);
				switch(v) {
				case null:
				case "false":
					e[name] = false; break;
				case "":
				case "true":
				case name:
					e[name] = true; break;
				}
			};
			return {
				checked: boolAttr("checked"),
				selected: boolAttr("selected")
			};
		})(),

		/** Replaces `anchor` with `update` by replacing only affected parts of the DOM. */
		replace(update, anchor, clone)
		{
			var cu = update.firstChild;
			var ca = anchor.firstChild;

			while(cu && ca)
			{
				var nu = cu.nextSibling;
				var na = ca.nextSibling;

				if(ca.nodeType !== cu.nodeType
				|| ca.nodeValue !== cu.nodeValue)
				{
					anchor.replaceChild(clone ? cu.cloneNode(true) : cu, ca);
				} else if(ca.nodeType === Node.ELEMENT_NODE)
				{
					// Ensure both nodes have the same tag name.
					if(ca.tagName !== cu.tagName)
					{
						// Workaround for changing an element's tag name.
						let dummy = document.createElementNS(cu.namespaceURI, cu.localName);
						dummy.replaceChildren(...ca.childNodes);
						ca.replaceWith(dummy);
						ca = dummy;
					}

					// Remove all attributes that are not in the update.
					for(let i = 0; i < ca.attributes.length;)
					{
						const attr = ca.attributes.item(i);
						if(!cu.attributes.getNamedItem(attr.name)) {
							ca.attributes.removeNamedItem(attr.name);
							const handler = Renderable._internal.specialAttrs[attr.name];
							handler?.(ca);
						} else i++;
					}

					// Add all attributes that are not in the anchor.
					for(let attr of cu.attributes)
					{
						let attrca = ca.attributes.getNamedItem(attr.name);
						if(!attrca)
						{
							attrca = document.createAttributeNS(attr.namespaceURI, attr.localName);

							attrca.value = attr.value;
							ca.attributes.setNamedItem(attrca);
						} else if(attrca.value !== attr.value)
						{
							attrca.value = attr.value;
						}

						const handler = Renderable._internal.specialAttrs[attr.name];
						handler?.(ca);
					}

					// Ensure that the contents match.
					if(ca.innerHTML !== cu.innerHTML) {
						Renderable._internal.replace(cu, ca, clone);
					}
				} else if(ca.nodeType === Node.TEXT_NODE)
				{
					if(ca.nodeValue !== cu.nodeValue)
						ca.nodeValue = cu.nodeValue;
				}

				ca = na;
				cu = nu;
			}

			while(cu)
			{
				var nu = cu.nextSibling;
				anchor.appendChild(clone ? cu.cloneNode(true) : cu);
				cu = nu;
			}

			while(ca)
			{
				const na = ca.nextSibling;
				anchor.removeChild(ca);
				ca = na;
			}
		},

		/** The default render function that is assigned to each renderable object. */
		render(obj)
		{
			Renderable.assertRenderable(this);

			const rthis = this._renderable;

			if(rthis.rendering)
				throw new Error("Fractal rendering occurred!");
			// Ensure that the renderable using this renderable is registered as parent, so that it is notified when this child is invalidated.
			let renderstack = Renderable._internal.renderstack;
			if(renderstack.length)
			{
				let last = renderstack.at(-1);
				if(!rthis.parents.includes(last))
					this._renderable.parents.push(last);
				if(last._renderable.has_anchor)
					rthis.has_anchor = true;

				// Prevent interactive renderables from being garbage-collected before the next re-render of the parent.
				let lastChildren = last._renderable.children;
				if(!lastChildren.includes(this))
					lastChildren.push(this);
				last._renderable.has_anchor ||= rthis.has_anchor;
			}
			if(rthis.dirty)
			{
				rthis.rendering = true;
				// Remove this node as parent from all previous rendering's children.
				for(const child of rthis.children)
					child._renderable.parents = child._renderable.parents.filter(p => p !== this);
				// Clear the children list for repopulation, release last rendering's temporary children for garbage collection.
				rthis.children = [];

				const settings = {};
				// Ignore render placeholders within the output.
				let new_html = Renderable.with(this, ()=> rthis.render.call(this, settings));
				let changed = (rthis.cache !== new_html);
				if(obj)
					obj.changed = changed;
				rthis.cache = new_html;

				// If interactive, inject renderable's ID into the new HTML.
				if(hasDom() && this._renderable.id !== undefined) {
					if(changed) {
						var root = document.createElement(settings.container ?? "span");
						root.innerHTML = this._renderable.cache;
						for(let tag of root.children) {
							let ids = tag.dataset?.renderableId?.split(",") ?? [];
							ids = ids.concat([this._renderable.id]).join();
							tag.dataset.renderableId = ids;
						}
						this._renderable.cache_final = root.innerHTML;
					}
				} else {
					if(changed)
						this._renderable.cache_final = this._renderable.cache;
				}

				this._renderable.dirty = false;
				this._renderable.rendering = false;
			}
			return this._renderable.cache_final;
		},

		/** Replaces anchor placeholders (${render.anchor} strings) with anchor tags in a node. */
		replace_placeholders(node)
		{
			if(Renderable._internal.ignore(node))
				return;

			switch(node.nodeType)
			{
			case Node.TEXT_NODE:
				{
					const regex = /\$\{render\.(.+?)\}/g;
					let match;
					if((match = regex.exec(node.nodeValue)) !== null)
					{
						let name = match[1];
						let anchor = document.createElement("X-RENDERABLEJS-IGNORE");
						anchor.setAttribute("name", "render." + match[1]);
						if(name in render)
						{
							anchor.innerHTML = render[name].render();
							if(render[name]._renderable.anchor instanceof Array)
								render[name]._renderable.anchor.push(anchor);
						} else
						{
							anchor.innerHTML = `\${render.${name}}`;
						}

						// put the rest of the text into a new text node.
						let newTextNode = document.createTextNode(node.textContent.substring(match.index+match[0].length));
						// insert the left part of the text into the old text node.
						node.textContent = node.textContent.substr(0, match.index);
						// insert newTextNode after node into the parent node.
						if(node.nextSibling !== null) {
							node.parentNode.insertBefore(newTextNode, node.nextSibling);
						} else {
							node.parentNode.appendChild(newTextNode);
						}
						// insert the anchor between the left and right part.
						node.parentNode.insertBefore(anchor, node.nextSibling);
					}
				} break;
			case Node.ELEMENT_NODE:
				{
					for(let c of node.childNodes)
					{
						Renderable._internal.replace_placeholders(c);
					}
				} break;
			}
		},

		forbidden_tags: {
			"SCRIPT":"",
			"STYLE":"",
			"CODE":"",
			"X-RENDERABLEJS-IGNORE": ""
		},

		ignore(node)
		{
			if(!node)
				return false;

			if(node.nodeType === Node.ELEMENT_NODE)
			{
				if((node.tagName in Renderable._internal.forbidden_tags)
				|| node.hasAttribute("data-renderablejs-ignore"))
				{
					if((node.getAttribute("data-renderablejs-ignore")||"").toLowerCase() !== "no")
						return true;
				}
				if((node.name || "").match(/render\..+/))
					return true;
			}

			return Renderable._internal.ignore(node.parentElement);
		},

		/** Registers the DOM mutation observer that automatically detects anchor placeholders in new nodes. */
		register_mutation_observer()
		{
			let observer = new MutationObserver(function(notifications, observer)
			{
				for(let notification of notifications)
				{
					switch(notification.type)
					{
					case 'childList':
						{
							for(let added of notification.addedNodes)
							{
								Renderable._internal.replace_placeholders(added);
							}
						} break;
					case 'characterData':
						{
							Renderable._internal.replace_placeholders(notification.target);
						} break;
					default:
					}
				}
			});

			observer.state = {
				attributes: false,
				characterDataOldValue: false,
				characterData: true,
				childList: true,
				subtree: true
			};

			observer.observe(document.body, observer.state);
		},

		renderstack: [],

		eventListeners: {},
		uniqueRenderables: {}
	},

	listenForEvents(events)
	{
		if(!hasDom()) return;

		let listeners = Renderable._internal.eventListeners;
		for(let name of events) {
			if(name in listeners)
				continue;

			listeners[name] = { handler: (e) => {
				let renderable;
				let called = false;
				for(let target = e.target; target; target = target?.parentElement) {
					for(let id of (target.dataset?.renderableId?.split(",")??[])) {
						let r = Renderable._internal.uniqueRenderables[id]?.deref();
						renderable = renderable ?? r;
						let handler = r?._renderable.events[e.type];
						if(handler && !handler.call(r, {
							type: e.type,
							data: { key:e.key, data:e.data },
							target: e.target,
							scope: renderable,
							bubbled: r != renderable,
							root: target,
						})) {
							e.preventDefault();
							return;
						}
						called ||= handler;
					}
				}

				// activate fallback:
				for(let r = listeners[name]?.fallback; r;
					r = r._renderable.parents.at(-1))
				{
					renderable = renderable ?? r;
					let handler = r?._renderable.events[e.type];
					if(handler && !handler.call(r, {
						type: e.type,
						data: { key:e.key },
						target: e.target,
						scope: renderable,
						bubbled: true,
					})) {
						e.preventDefault();
						return;
					}
				}
			}};
			document.addEventListener(name, listeners[name].handler);
		}
	},

	unlistenEvents(events) {
		let listeners = Renderable._internal.eventListeners;
		for(let event of events) {
			document.removeEventListener(event, listeners[event]?.handler);
			delete listeners[event];
		}
	},

	unlistenAllEvents() {
		Renderable.unlistenEvents(Object.keys(Renderable._internal.eventListeners));
	}
};

if(declareGlobals) {
	globalScope.Renderable = Renderable;
	globalScope.render = render;
} else {
	(isBrowser ? {} : module).exports = { Renderable, render };
}

// Every minute, clear the interactive renderable map.
setInterval(() => {
	let map = Renderable._internal.uniqueRenderables;
	for(let id in map) {
		if(map[id].deref() === undefined) {
			delete(map[id]);
		}
	}
}, 60000);

if(hasDom())
	document.addEventListener("DOMContentLoaded", function() {
		Renderable._internal.replace_placeholders(document.body);
		Renderable._internal.replace_placeholders(document.head);
		Renderable._internal.register_mutation_observer();
	});
})();