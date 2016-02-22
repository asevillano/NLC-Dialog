/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *			http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*eslint-env node */
'use strict';

var express		= require('express'),
	app			= express(),
	bluemix		= require('./config/bluemix'),
	extend		= require('util')._extend,
	watson		= require('watson-developer-cloud');

// Bootstrap application settings
require('./config/express')(app);

// if bluemix credentials exists, then override local
var credentialsNLC = extend({
	version: 'v1',
	url : 'https://gateway.watsonplatform.net/natural-language-classifier/api',
	username : 'abc2706e-43c4-440e-8e01-5428aeb43666',
	password : 'QIFQWsr7PsMX'
	// username: '<username>',
	// password: '<password>'
}, bluemix.getServiceCreds('natural_language_classifier')); // VCAP_SERVICES

// if bluemix credentials exists, then override local
var credentialsDialog =	extend({
	url: 'https://gateway.watsonplatform.net/dialog/api',
	username: 'c0820949-c9c3-4f4b-9932-26278ef3cad7',
	password: '7DKt5aDAcnpx',
	// username: '<username>',
	// password: '<password>'
	version: 'v1'
}, bluemix.getServiceCreds('dialog')); // VCAP_SERVICES

// Create the service wrapper
var nlClassifier = watson.natural_language_classifier(credentialsNLC);

// Create the service wrapper
var dialog = watson.dialog(credentialsDialog);

var dialog_id = process.env.DIALOG_ID || "8e6e51ac-3702-4515-86ff-90c48890ab5f";
var classifier_id = process.env.CLASSIFIER_SPECIFIC_ID || "c7fa4ax22-nlc-1977"; // CLASSIFIER_ID especifico para saber la pregunta concreta a la que nos referimos

// render index page
app.get('/', function(req, res) {
	res.render('index');
});

app.get('/setDialogID', function(req, res) {
	dialog_id = req.query.newID;
	res.send('Dialog ID updated');
});

app.get('/setClassifierID', function(req, res) {
	classifier_id = req.query.newID;
	res.send('Classifier ID updated');
});

app.post('/conversation', function(req, res, next) {
	var params = extend({ dialog_id: dialog_id }, req.body);
	dialog.conversation(params, function(err, results) {
		if (err)
			return next(err);
		if (req.body.input && results.confidence === 0 || results.response.length === 0 ) {
			var paramsClassifier = {
				classifier: classifier_id,
				text: req.body.input
			};
			nlClassifier.classify(paramsClassifier, function(err, resultsClassifier) {
				if (err)
					return next(err);
				if (resultsClassifier.classes[0].confidence > 0.4)
					params.input = resultsClassifier.top_class;
				dialog.conversation(params, function(err, secondResults) {
					if (err)
						return next(err);
					res.json({ dialog_id: dialog_id, conversationOrigin: results, nlcParameter: paramsClassifier,
							   nlc: resultsClassifier, conversationParameters: params, conversation: secondResults });	
				});
			});
		} else
			res.json({ dialog_id: dialog_id, conversation: results});
	});
});

app.post('/profile', function(req, res, next) {
	var params = extend({ dialog_id: dialog_id }, req.body);
	dialog.getProfile(params, function(err, results) {
		if (err)
			return next(err);
		else
			res.json(results);
	});
});

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
