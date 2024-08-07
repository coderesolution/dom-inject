/**
 * Written by Elliott Mangham at Code Resolution. Maintained by Code Resolution.
 * made@coderesolution.com
 */
import DOMPurify from 'dompurify'

export default class ContentFetch {
	constructor(options = {}) {
		this.options = {
			loadingClass: options.loadingClass || 'is-loading',
			loadedClass: options.loadedClass || 'has-loaded',
			errorClass: options.errorClass || 'has-error',
			debugMode: options.debugMode || false,
			...options,
		}
		this.cache = new Map()
		this.controller = new AbortController()
	}

	log(message) {
		if (this.options.debugMode) {
			console.log(message)
		}
	}

	fetchContent(url, sourceScope = null, includeParent = false) {
		return fetch(url, { signal: this.controller.signal })
			.then((response) => {
				if (!response.ok) {
					throw new Error('Network response was not ok.')
				}
				this.log('Fetch response received')
				return response.text()
			})
			.then((data) => {
				const parser = new DOMParser()
				const doc = parser.parseFromString(data, 'text/html')
				let element = sourceScope ? doc.querySelector(sourceScope) : doc.body
				if (!element) {
					throw new Error(`Element not found for selector: ${sourceScope}`)
				}
				this.log('Parsed HTML and found element')

				// Sanitize the HTML content
				element =
					includeParent && sourceScope
						? DOMPurify.sanitize(element.outerHTML)
						: DOMPurify.sanitize(element.innerHTML)
				return element
			})
	}

	from({ selector, url = window.location.href, includeParent = false, onStart, onEnd, onError }) {
		if (!selector) {
			const error = new Error('Selector must be defined.')
			if (onError) {
				onError(error)
			} else {
				console.error(error)
			}
			return Promise.reject(error)
		}

		if (onStart) onStart()

		const cacheKey = `${url}-${selector}-${includeParent}`
		this.log(`Cache key is: ${cacheKey}`)

		return new Promise((resolve, reject) => {
			if (this.cache.has(cacheKey)) {
				const cachedData = this.cache.get(cacheKey)
				this.log('Serving from cache')
				if (onEnd) onEnd(cachedData)
				resolve(cachedData)
				return
			}

			this.log(`Fetching data from URL: ${url}`)
			if (url === window.location.href) {
				const sourceElement = document.querySelector(selector)
				if (!sourceElement) {
					const error = new Error(`Element not found for selector: ${selector}`)
					if (onError) {
						onError(error)
					} else {
						console.error(error)
					}
					return reject(error)
				}
				const html = includeParent ? sourceElement.outerHTML : sourceElement.innerHTML
				const sanitizedHtml = DOMPurify.sanitize(html)
				this.cache.set(cacheKey, sanitizedHtml)
				if (onEnd) onEnd(sanitizedHtml)
				resolve(sanitizedHtml)
			} else {
				this.fetchContent(url, selector, includeParent)
					.then((html) => {
						this.cache.set(cacheKey, html)
						if (onEnd) onEnd(html)
						resolve(html)
					})
					.catch((error) => {
						if (onError) {
							onError(error)
						} else {
							console.error('Error fetching content:', error)
						}
						reject(error)
					})
			}
		})
	}

	to({ destination, data, mode = 'replace', delay = 0, onStart, onEnd, onError }) {
		if (!destination || !data) {
			const error = new Error('Destination and data must be defined.')
			if (onError) {
				onError(error)
			} else {
				console.error(error)
			}
			return Promise.reject(error)
		}

		const targetElement = typeof destination === 'string' ? document.querySelector(destination) : destination
		if (!targetElement) {
			const error = new Error(`Target element not found for selector: ${destination}`)
			if (onError) {
				onError(error)
			} else {
				console.error(error)
			}
			return Promise.reject(error)
		}

		const startPromise = onStart ? Promise.resolve(onStart(destination, data)) : Promise.resolve()

		// Add loading class
		targetElement.classList.add(this.options.loadingClass)

		const insertContent = () => {
			try {
				this.log(`Inserting content via '${mode}' mode`)
				const fragment = document.createDocumentFragment()
				const tempDiv = document.createElement('div')
				tempDiv.innerHTML = data

				if (mode === 'prepend') {
					for (const node of [...tempDiv.childNodes].reverse()) {
						targetElement.insertBefore(node, targetElement.firstChild)
					}
				} else if (mode === 'append') {
					targetElement.appendChild(tempDiv)
				} else {
					targetElement.innerHTML = '' // Clear the existing content
					targetElement.appendChild(tempDiv)
				}

				// Remove loading class and add loaded class
				targetElement.classList.remove(this.options.loadingClass)
				targetElement.classList.add(this.options.loadedClass)

				if (onEnd) onEnd(targetElement)
				return Promise.resolve(targetElement)
			} catch (error) {
				// Remove loading class and add error class
				targetElement.classList.remove(this.options.loadingClass)
				targetElement.classList.add(this.options.errorClass)

				if (onError) {
					onError(error)
				} else {
					console.error('Error inserting content:', error)
				}
				return Promise.reject(error)
			}
		}

		if (delay > 0) {
			this.log(`Delaying insertion by ${delay} seconds`)
			setTimeout(() => startPromise.then(insertContent), delay * 1000)
		} else {
			return startPromise.then(insertContent)
		}
	}

	fromTo(fromParams, toParams) {
		this.from(fromParams)
			.then((html) => {
				return this.to({ ...toParams, data: html })
			})
			.catch((error) => {
				// errors are handled in from() and to()
			})
	}

	abortFetch() {
		this.controller.abort()
		this.controller = new AbortController()
		this.cache.clear()
	}
}

window.ContentFetch = ContentFetch
