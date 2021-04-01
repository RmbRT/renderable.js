/**
 *
 * @licstart  The following is the entire license notice for the 
 *  JavaScript code in this page.
 *
 * Copyright (C) 2019, 2021  RmbRT
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
		When a renderable property is changed, the associated renderable object is re-rendered.
	@param obj:
		The renderable object.
	@param fields:
		An object containing the properties to be added, as well as their initial values. */
	addFields(obj, fields)
	{
		Renderable.assertRenderable(obj);

		for(name in fields)
		{
			if(!(name in obj))
			{
				obj._renderable.values[name] = fields[name];
				Object.defineProperty(obj, name, {
					get: ((name) => { return function(){ return this._renderable.values[name]; }; })(name),
					set: ((name) => { return function(value)
						{
							if(this._renderable.values[name] !== value)
							{
								this._renderable.values[name] = value;
								Renderable.invalidate(this);
							}
						}; })(name)
				});
			} else console.warn(`addFields: Property '${name}' added twice.`);
		}

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
			If any of the children is updated, this object will also be updated. Allowed values are either a renderable object, or an array of renderable objects. */
	enable(obj, params)
	{
		if(Renderable.isRenderable(obj))
			throw new Error("Object must not yet be renderable.");

		if(!(params.render instanceof Function))
			throw new Error("Expected 'render' function in params.");

		if("render" in obj)
			throw new Error("Object must not yet have a 'render' function.");
		obj.toString = obj.render = Renderable._internal.render;

		if("anchor" in params)
		{
			if(params.anchor instanceof Element)
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
			values: {},
			locked: 0,
			dirty: true,
			anchor: params.anchor || [],
			children: [],
			parents: [],
			render: params.render,
			cache: null,
			rendering: false
		};

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
	@param untracked:
		(Optional) An object containing additional properties of the renderable object and their initial values.
		Fields in this object will not be tracked and modifications will not result in a re-render. */
	create(fields, params, untracked)
	{
		var r = Renderable.addFields(
			Renderable.enable(
				Object.assign({}, untracked),
				params),
			fields);
		Renderable.render(r);
		return r;
	},

	/** Renders the renderable object into all its anchors.
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

		var out = {};
		let html = renderable.render(out);
		if(!out.changed)
			return false;

		var anchor = renderable._renderable.anchor;
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
		{
			if(!--renderable._renderable.locked)
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
		renderable._renderable.dirty = true;
		if(Renderable.render(renderable))
			for(parent of renderable._renderable.parents)
				Renderable.invalidate(parent);
	},

	_internal:
	{
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
						ca.tagName = cu.tagName;

					// Add all attributes that are not in the anchor.
					for(var attr of cu.attributes)
					{
						var attrca = ca.attributes.getNamedItem(attr.name);
						if(!attrca)
						{
							attrca = document.createAttribute(attr.name);
							attrca.value = attr.value;
							ca.attributes.setNamedItem(attrca);
						} else if(attrca.value !== attr.value)
						{
							attrca.value = attr.value;
						}
					}
					// Remove all attributes that are not in the update.
					for(var attr of ca.attributes)
						if(!cu.attributes.getNamedItem(attr.name))
							ca.attributes.removeNamedItem(attr.name);

					// Ensure that the contents match.
					if(ca.innerHTML !== cu.innerHTML)
						Renderable._internal.replace(cu, ca, clone);
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
				var na = ca.nextSibling;
				anchor.removeChild(ca);
				ca = na;
			}
		},

		/** The default render function that is assigned to each renderable object. */
		render(obj)
		{
			if(this._renderable.rendering)
				throw new Error("Fractal rendering occurred!");
			// Ensure that the renderable using this renderable is registered as parent.
			let renderstack = Renderable._internal.renderstack;
			if(Renderable._internal.renderstack.length)
			{
				let last = renderstack[renderstack.length-1];
				if(!this._renderable.parents.find(e => last === e))
					this._renderable.parents.push(last);
			}
			if(this._renderable.dirty)
			{
				this._renderable.rendering = true;

				Renderable._internal.renderstack.push(this);
				// Ignore render placeholders within the output.
				let new_html = this._renderable.render.apply(this);
				if(obj)
				{
					obj.changed = (this._renderable.cache !== new_html);
				}
				this._renderable.cache = new_html;
				this._renderable.dirty = false;
				this._renderable.rendering = false;
				Renderable._internal.renderstack.pop();
			}
			return this._renderable.cache;
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
					var match;
					if((match = regex.exec(node.nodeValue)) !== null)
					{
						let name = match[1];
						var anchor = document.createElement("X-RENDERABLEJS-IGNORE");
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
						var newTextNode = document.createTextNode(node.textContent.substring(match.index+match[0].length));
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
					for(var c of node.childNodes)
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
			var observer = new MutationObserver(function(notifications, observer)
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

		renderstack: []
	}
};

// Ensure the global render namespace exists.
window.render = {};

document.addEventListener("DOMContentLoaded", function() {
	Renderable._internal.replace_placeholders(document.body);
	Renderable._internal.replace_placeholders(document.head);
	Renderable._internal.register_mutation_observer();
});