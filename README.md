# Renderable.js

> Free lightweight dynamic component rendering framework.

## Features

**Easy component injection**&emsp;
In your HTML, simply write `${render.component-name}`, where `component-name` is the name of your component.
This automatically inserts the selected component into your document, or, if the component does not exist yet, creates a placeholder which will be replaced with the component as soon as it is created!

**Easy to script**&emsp;
In your script, simply create a new component by writing the following:

```javascript
Renderable.create({
	lastName: "Stallman",
	firstName: "Richard M.",
	title: "Dr."
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
		return `Hello, ${render.user}, it's nice to see you!`;
	},
	children: [render.user],
	anchor: "greeting"
});
```

Note, that whenever you access a renderable from within another renderable, you have to add it in the `children` parameter.
This registers a dependency between the renderables, and when the utilised renderable is updated, the other renderable is also updated.
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
		return `${this.time.getHours()}:${this.time.getMinutes}`;
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

# License

Renderable.js is released under the GNU General Public License (GNU GPL) as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
A copy of the license can befound in [`LICENSE`](LICENSE).