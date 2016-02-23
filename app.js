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

'use strict';

var express		= require('express'),
	app			= express(),
	bluemix		= require('./config/bluemix'),
	extend		= require('util')._extend,
	watson		= require('watson-developer-cloud'),
	multer		= require('multer'),
	fs			= require('fs');
	
var Cloudant = require('cloudant');
var username = process.env.cloudant_username || "05a2ef2a-c1c0-4241-9266-d4d8d1c92cee-bluemix";
var password = process.env.cloudant_password || "07805190703e0982aadc094d58b089f9d77ecb209e8da5a7233ecfa868cbd563";
var cloudant = Cloudant({account:username, password:password});


// Bootstrap application settings
require('./config/express')(app);

//app.use(multer({ dest: './public/images/'}));

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

var dialog_id = process.env.DIALOG_ID || "<dialog_id>";
var classifier_id = process.env.CLASSIFIER_ID || "<classifier_id>";

// Interface configuration
var bannerColor = "white";
var bannerDescription = "WATSON DIALOG";
var avatarBackgroundColor = "white";
var avatarBorderColor = "blue";
var title = "Watson Dialog";

// render index page
app.get('/', function(req, res) {
	res.render('index');
});

var upload = multer({ dest: 'public/images' });

app.post('/config', upload.fields([{ name: 'backgroundImage', maxCount: 1 }, { name: 'bannerImage', maxCount: 1 }, { name: 'avatarImage', maxCount: 1 }, { name: 'tabImage', maxCount: 1 }]), function(req, res, next) {
	if (req.files.backgroundImage)
		fs.rename(req.files.backgroundImage[0].path.replace(/\\/g, '\/'), "public/images/background.jpg", function (err) {
			if (err) throw err;
			console.log('Background uploaded');
		});
	if (req.files.bannerImage)
		fs.rename(req.files.bannerImage[0].path.replace(/\\/g, '\/'), "public/images/banner.png", function (err) {
			if (err) throw err;
			console.log('Banner uploaded');
		});
	if (req.files.avatarImage)
		fs.rename(req.files.avatarImage[0].path.replace(/\\/g, '\/'), "public/images/avatar-watson.png", function (err) {
			if (err) throw err;
			console.log('Avatar uploaded');
		});
	if (req.files.tabImage)
		fs.rename(req.files.tabImage[0].path.replace(/\\/g, '\/'), "public/images/favicon.ico", function (err) {
			if (err) throw err;
			console.log('Tab image uploaded');
		});
	if (req.body.dialogID != '')
		dialog_id = req.body.dialogID;
	if (req.body.classifierID != '')
		classifier_id = req.body.classifierID;
	
	if (req.body.watsonBannerColor != '')
		bannerColor = req.body.watsonBannerColor;
	if (req.body.watsonBannerDescription != '')
		bannerDescription = req.body.watsonBannerDescription;
	if (req.body.watsonBackgroundColor != '')
		avatarBackgroundColor = req.body.watsonBackgroundColor;
	if (req.body.watsonBorderColor != '')
		avatarBorderColor = req.body.watsonBorderColor;
	if (req.body.tabName != '')
		title = req.body.tabName;

	cloudant.db.destroy('config', function(err) {
		cloudant.db.create('config', function() {
			var config = cloudant.db.use('config')

			config.insert({ value: dialog_id }, 'dialog_id', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
			config.insert({ value: classifier_id }, 'classifier_id', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
		});
	});
	res.send('Updated');
});

app.get('/getConfig', function(req, res) {
	res.json({ bannerColor: bannerColor, bannerDescription: bannerDescription, avatarBackgroundColor: avatarBackgroundColor,
			   avatarBorderColor: avatarBorderColor, title: title });
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

function getIDs() {
	var db = cloudant.db.use("ids");
	db.get("dialog_id", function(err, data) {
		dialog_id = data.value;
	});
	db.get("classifier_id", function(err, data) {
		classifier_id = data.value;
	});
}

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
getIDs();
