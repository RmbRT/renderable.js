# ![Renderable.js](logo.png?raw=true "Renderable.js logo")

> Free lightweight dynamic component rendering framework.

## Features

**Easy component injection**&emsp;
In your HTML, simply write `${render.component-name}`, where `component-name` is the name of your component.
This automatically inserts the selected component into your document, or, if the component does not exist yet, creates a placeholder which will be replaced with the component as soon as it is created!

**Easy to script**&emsp;
In your script, simply create a new component by writing the following:

```javascript
Renderable.create({
	lastName: "Davis",
	firstName: "Terrence Andrew",
	title: "Saint"
}, {
	render() {
		return `${this.title} ${this.firstName} ${this.lastName}`.trim();
	},
	anchor: "user"
});
```

This creates a renderable object called `render.user`, with the properties `lastName`, `firstName`, and `title`.
The object's values can be accessed and changed through `render.user.lastName` etc.

To display the object, in your HTML file, write:

```xml
<body>
	<p>Welcome, ${render.user}!</p>
	<p>
		To finish your registration, please click the
		link that has been sent to your email address.
	</p>
</body>
```

**Modularity**&emsp;
You can easily compose components out of other components, to reuse them:

```javascript
Renderable.create({}, {
	render() {
		return `Hello, ${render.user}, peace unto you!`;
	},
	anchor: "greeting"
});
```

When the utilised renderable is updated, the other renderable is also updated.
This ensures that you can save a lot of code duplication.

```xml
<body>
	<p>${render.greeting}</p>
</body>
```

**Smart automatic refresh**&emsp;
Whenever you modify a component's values, all appearances of it in the document are re-rendered.
This also affects components that use the modified component.
To modify a component, simply access its object through the global `render` object:

```javascript
Renderable.create({
	time: new Date()
}, {
	render() {
		return `${this.time.getHours()}:${this.time.getMinutes()}`;
	},
	anchor: "time"
});
// Update the time in regular intervals.
setInterval(() => { render.time.time = new Date(); }, 50);
```

```xml
<body>
	<p>It is currently ${render.time}.</p>
</body>
```

This displays the current time in the document.
Note that even the very frequent modification of the time variable does not have much impact on performance, as *caching and smart updating* is employed: only if the generated HTML changed, the element is redrawn.
This only redraws the time if the string returned by `render()` differs from the previous string.

**Dynamic HTML support**&emsp;
Even if you insert HTML dynamically into the site, then `${}` anchors are properly recognised and replaced.
This makes the framework very flexible in its usage, and compatible with more sophisticated libraries that modify the DOM.

**Turning on/off substitution**&emsp;
Substitution is automatically disabled in `code`, `script`, `style`, and the custom `x-renderablejs-ignore` tags and their descendants.
It is also possible to turn on substitution in a disabled tag by adding the `data-renderablejs-ignore=no` attribute.
If it is present, but not set to `no`, it also suppresses substitution.
Note that you cannot turn on substitution inside a tag whose parent tag has disabled substitution.
Also note that if a substitution results in a placeholder being generated, it is not substituted again.

**Events and interactions**&emsp;
You can create _interactive renderables_ which are treated differently from usual renderables and can receive events sent to their corresponding HTML elements.
This is done with `Renderable.createInteractive`, and supplying an `events` property in the second argument. **Warning**: please make sure to read the troubleshooting section below before using interactibles!

```js
function button(text, {onClick, anchor}) {
	return Renderable.createInteractive({text, onClick}, {
		render() { return `<button>${this.text}</button>`; },
		events: {
			click() { this.onClick() }
		},
		anchor
	});
}
```

```js
Renderable.create({
		"list": ["wooden door", "bicycle exercise trainer", "barbecue"]
	}, {
		anchor: "myList",
		render() {
			return `
<ul class="removable-list">
	${this.list.map((text, i) => `
	<li>${text} ${
		button("x", {
			onClick: () => {
				// Remove entry from list.
				this.list.splice(i, 1);
				// Re-render.
				Renderable.invalidate(this);
			}
		})
	}</li>`).join("")
}</ul>`;
		}
	});
```

```xml
<h1>Shopping list</h1>
${render.myList}
```

### Troubleshooting

For interactive renderables, the returned HTML is processed (top-level nodes are annotated with an ID). This step may break the HTML if its top-level nodes are not allowed as children to generic HTML nodes (such as `td` and `tr`). In that case, specify the required container element in the `render()` method as follows, by using an `out` parameter passed to it (as a callback):

```js
{
	render(settings) {
		settings({container: "tbody"});
		return `<tr><td>...</td></tr>`;
	}
}
```

Failing to do so will result in botched HTML, as the HTML of interactibles is parsed into the children of a HTML tag via `Element.innerHTML`, which are then annotated with IDs, and converted back into HTML (again, via `innerHTML`). Sadly, there is no lightweight way to parse HTML natively, so `tr` and `td` tags are eliminated in the process. The `settings.container` option sets the desired tag name of the temporary container element, working around the issue.

**`settings.inline`**&emsp;To allow the use of a renderable in attributes or other places where a placeholder tag is not legal, set `settings.inline`. This pastes the renderable's HTML as a normal string. This probably also a good thing to do for small text-only nodes in general. If this field is not set, then it will generate a placeholder tag in its parent renderables. Especially for complex DOM elements, it is preferable not to inline them, as the cached DOM can be assembled more efficiently and less parsing and pasting occurs. **Important**: when inlining, set the settings *before* rendering any children, as this call propagates the settings as contextual information down to the children.

## Server-side use

If you're in a non-DOM context, like Node.js, you can simply `require()` renderable.js and it will return `{ Renderable, render }`.
If you want to import it in a way that's more compatible with DOM-style JS (using global scope instead of modules), define `global.RenderableUseGlobal = true` before calling `require()`.
This will define `Renderable` and `render` as global objects which will be visible in all scripts.

# License

Renderable.js is released under the GNU General Public License (GNU GPL) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
A copy of the license can befound in [`LICENSE`](LICENSE).