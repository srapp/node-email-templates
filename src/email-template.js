import P from 'bluebird'
import Debug from 'debug'
import {basename} from 'path'
import juice from 'juice'
import isFunction from 'lodash/isFunction'
import {ensureDirectory, readContents, renderFile} from './util'

const debug = Debug('email-templates:email-template')

export default class EmailTemplate {
  constructor (path, options = {}) {
    this.files = {}
    this.path = path
    this.dirname = basename(path)
    this.options = options
    debug('Creating Email template for path %s', basename(path))
  }

  _init () {
    if (this.isInited) return P.resolve()

    debug('Initializing templates')
    return ensureDirectory(this.path)
    .then(() => this._loadTemplates())
    .then(() => {
      this.isInited = true
      debug('Finished initializing templates')
    })
  }

  _loadTemplates () {
    return P.map(['html', 'text', 'style'], (type) => {
      return readContents(this.path, type)
    })
    .then((files) => {
      let [html, text, style] = files

      if (!html && !text) {
        let err = new Error(`Neither html nor text template files found or are both empty in path ${this.dirname}`)
        err.code = 'ENOENT'
        throw err
      }

      if (html) {
        debug('Found HTML file %s in %s', basename(html.filename), this.dirname)
      }
      this.files.html = html

      if (text) {
        debug('Found text %s file in %s', basename(text.filename), this.dirname)
      }
      this.files.text = text

      if (style) {
        debug('Found stylesheet %s in %s', basename(style.filename), this.dirname)
      }
      this.files.style = style

      debug('Finished loading template')
    })
  }

  renderText (locals, callback) {
    debug('Rendering text')
    return this._init()
    .then(() => {
      if (!this.files.text) return null
      return renderFile(this.files.text, locals)
    })
    .tap(() => debug('Finished rendering text'))
    .nodeify(callback)
  }

  renderHtml (locals, callback) {
    debug('Rendering HTML')
    return this._init()
    .then(() => {
      return P.all([
        renderFile(this.files.html, locals),
        this._renderStyle(locals)
      ])
    })
    .then((results) => {
      let [html, style] = results
      if (!style) return html
      if (this.options.juiceOptions) {
        debug('Using juice options ', this.options.juiceOptions)
      }
      return juice.inlineContent(html, style, this.options.juiceOptions || {})
    })
    .tap(() => debug('Finished rendering HTML'))
    .nodeify(callback)
  }

  renderTemplate (callback) {
    debug('Rendering template')
    return this._init()
    .then(this._renderStyle())
    .then((style) => {
      let html = this.files.html
      if (!html) return null
      let template = this.files.html.content
      if (!style) return template
      if (this.options.juiceOptions) {
        debug('Using juice options ', this.options.juiceOptions)
      }
      return juice.inlineContent(template, style, this.options.juiceOptions || {})
    })
    .tap(() => debug('Finished rendering template'))
    .nodeify(callback)
  }

  render (locals, callback) {
    if (isFunction(locals)) {
      callback = locals
      locals = {}
    }
    debug('Rendering template with locals %j', locals)

    return P.all([
      this.renderHtml(locals),
      this.renderText(locals),
      this.renderTemplate()
    ])
    .then((rendered) => {
      let [html, text, template] = rendered
      return {
        html, text, template
      }
    })
    .nodeify(callback)
  }

  _renderStyle (locals) {
    return new P((resolve) => {
      // cached
      if (this.style !== undefined) return resolve(this.style)

      // no style
      if (!this.files.style) return resolve(null)

      debug('Rendering stylesheet')
      renderFile(this.files.style, locals)
      .then((style) => {
        this.style = style
        debug('Finished rendering stylesheet')
        resolve(style)
      })
    })
  }
}
