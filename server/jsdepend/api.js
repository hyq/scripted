/*******************************************************************************
 * @license
 * Copyright (c) 2012 VMware, Inc. All Rights Reserved.
 * THIS FILE IS PROVIDED UNDER THE TERMS OF THE ECLIPSE PUBLIC LICENSE
 * ("AGREEMENT"). ANY USE, REPRODUCTION OR DISTRIBUTION OF THIS FILE
 * CONSTITUTES RECIPIENTS ACCEPTANCE OF THE AGREEMENT.
 * You can obtain a current copy of the Eclipse Public License from
 * http://www.opensource.org/licenses/eclipse-1.0.php
 *
 * Contributors:
 *     Kris De Volder - initial API and implementation
 ******************************************************************************/

/*global esprima require define console module*/
//Api version of JSDepend. Suitable for calling directly from JavaScript code.

if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}
define(function(require, exports, module) {

var parser = require("./parser");
var findReferences = require("./reference-finder").findReferences;
var eachk = require("./utils").eachk;

//function dumpTree(parseTree) {
//	console.log(JSON.stringify(parseTree, null, "  "));
//}

function fromConfig(conf, name, type) {
	var it = conf[name];
	if (!it) {
		throw "jsdepend/api conf must provide a definition for '"+name+"'";
	}
	if (type && typeof(it)!==type) {
		throw "jsdepend/api conf must provide a '"+type+"' for '"+name+"'";
	}
	return it;
}

/**
 * wraps a callback function so that is logs the value passed to the callback
 * in JSON.stringified form.
 */
function logBack(msg, callback) {
	return function (result) {
		console.log(msg); 
		console.log(JSON.stringify(result, null, "  "));
		callback(result);
	};
}

/**
 * This function 'creates' the API. It requires a configuration object.
 */
function configure(config) {

	var getContents = fromConfig(config, 'getContents', 'function');
	var resolve = require("./resolver").configure(config).resolve;
	var getIndexer = require('./file-indexer').configure(config).getIndexer;
	var getConf = require('./dot-scripted').configure(config).getConfiguration;
	var retrieveNearestFile = require('./retrieve-nearest-file').configure(config).retrieveNearestFile;
	
//	console.log('jsdepend/api is using encoding: '+encoding);
	
	function getReferences(handle, callback) {
		getContents(handle, 
			function (contents) {
				var tree = parser.parse(contents);
				findReferences(tree, callback);
			},
			function (err) {
				console.error(err);
				callback([]);
			}
		);
	}
	
	function getDependencies(handle, callback) {
		//callback = logBack("getDependencies("+handle+") ==> ", callback);
		getReferences(handle, function (refs, kind) {
			resolve(handle, refs, function (resolvedRefs) {
				callback(resolvedRefs, kind);
			});
		});
	}

    /**
	 * Create a 'store' to record the result of getDGraph function. 
	 */
	function makeGraphStore() {
		var graph = {};
		var seen = {}; //The properties of this are path strings. It is assumed that the a path uniquely identifies
					   //modules we have already seen (i.e. we have already processed them, or are currently processing them).
					   //This is used to detect and break cycles.
					   //We can't use the graph itself for this because nodes are only added to the graph after
					   //all their children have been processed.

		return {
			/**
			 * Mark a given file handle as being processed. The function returns true if the mark was succesfully
			 * added (i.e. it was not 'marked' before).
			 *
			 * @param String handle
			 * @return boolean 
			 */
			mark: function (handle, mark) {
				var notMarked = !seen.hasOwnProperty(handle);
				if (notMarked) {
					seen[handle] = true;
				}
				return notMarked;
			},
			/**
			 * Add a node to the graph. It is assumed the node doesn't exist yet, but we
			 * do not check this!
			 */
			addNode: function (path, node) {
				graph[path] = node;
			},
			/**
			 * Retrieve all the dependencies in the order they where added.
			 *
			 * @return Array.<Dependency>
			 */
			getGraph: function () {
				return graph;
			}
		};
	}
	
	function buildGraph(handle, store, k) {
		if (handle && store.mark(handle)) {
			getDependencies(handle, function (deps, kind) {
				var refs = {};
				var node = {
					kind: kind,
					refs: refs
				};
				eachk(deps, function (dep, k) {
						refs[dep.name] = dep;
						buildGraph(dep.path, store, k);
					},
					function () {  
						//all deps have been processed
						store.addNode(handle, node);
						k();
					}
				);
			});
		} else {
			k();
		}
	}
	
	function getDGraph(handle, callback) {
		var store = makeGraphStore();
		buildGraph(handle, store, function () {
			callback(store.getGraph());
		});
	}
	
	function findFileNamesContaining(currentFile, substring, callback, errback) {
		getIndexer(currentFile, 
			function (indexer) {
				indexer.findFileNamesContaining(substring, callback, errback);
			}
		);
	}
	
	getDGraph.remoteType =  ['JSON', 'callback'];
	getDependencies.remoteType = ['JSON', 'callback'];
	getContents.remoteType = ['JSON', 'callback', 'errback'];
	findFileNamesContaining.remoteType =  ['JSON', 'JSON', 'callback', 'errback'];
	getConf.remoteType = ['JSON', 'callback'];
	retrieveNearestFile.remoteType = ['JSON', 'JSON', 'JSON', 'callback'];
	
	//Creates the API object containing all exported operations for this API.
	return {
		getContents: getContents,
		getDependencies: getDependencies,
		getDGraph: getDGraph,
		findFileNamesContaining: findFileNamesContaining,
		getConf: getConf,
		retrieveNearestFile: retrieveNearestFile
	};
}

exports.configure = configure;

});

