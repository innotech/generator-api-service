var _ = require('lodash')
var util = require('util')
var restify = require('restify')
var winston = require('winston')
var winstonAdapter = require('bunyan-winston-adapter')
var EventEmitter = require('events').EventEmitter
var pkg = require('../package.json')
var api = require('./api')

module.exports = function serverFactory(options) {
  return new Server(options)
}

function Server(options) {
  this.options = _.merge({}, this.defaults, options)
}

Server.prototype = Object.create(EventEmitter.prototype)

Server.prototype.defaults = {
  host: '0.0.0.0',
  port: 8080,
  mock: false,
  debug: false,
  verbose: true,
  basePath: '/api'
}

Server.prototype.start = function () {
  try {
    this._createServer()
  } catch (e) {
    this.emit('error', e)
  }
  return this
}

Server.prototype._createServer = function () {
  var server = this.restify = restify.createServer({
    name: pkg.name,
    version: pkg.version,
    log: winstonAdapter.createAdapter(winston),
  })

  defineEndpoints(this)
  defineMiddlewares(this)

  server.listen(this.options.port, function () {
    this.emit('ready', this.options)
  }.bind(this))
}

Server.prototype.stop = function () {
  this.restify.close(function () {
    this.emit('close')
  }.bind(this))
}

function defineMiddlewares(server) {
  var restify = server.restify
  restify.use(restify.bodyParser())
  restify.use(restify.queryParser())
  restify.use(restify.gzipResponse())
  restify.use(restify.fullResponse())
  restify.use(defineCORS)
  restify.use(exposeServer(server))
  //restify.use(trafficThrottle())
  restify.opts(/\.*/, function (req, res) { res.send(204) })
  if (server.options.verbose) restify.use(verboseLog)
}

function defineEndpoints(server) {
  api(server)
}

function exposeServer(app) {
  return function (req, res, next) {
    res.server = server
    next()
  }
}

function trafficThrottle() {
  return restify.throttle({
    burst: 100,
    rate: 25,
    ip: true,
    overrides: {
      '127.0.0.1': { rate: 0, burst: 0 }
    }
  })
}

function defineCORS(req, res, next) {
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Credentials', true)
    res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method'] || 'GET, POST, DELETE, PUT, PATCH')
    res.header('Access-Control-Allow-Origin', req.headers.origin)
    if (req.headers['access-control-request-headers']) {
      res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'])
    }
  }
  next()
}
