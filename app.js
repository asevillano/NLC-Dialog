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

// Bootstrap application settings
require('./config/express')(app);

//app.use(multer({ dest: './public/images/'}));

// if bluemix credentials exists, then override local
var credentialsNLC = extend({
	url : '<url>',
	username: '<username>',
	password: '<password>'
}, bluemix.getServiceCreds('natural_language_classifier')); // VCAP_SERVICES

// if bluemix credentials exists, then override local
var credentialsDialog =	extend({
	url : '<url>',
	username: '<username>',
	password: '<password>'
}, bluemix.getServiceCreds('dialog')); // VCAP_SERVICES

// Create the service wrapper
var nlClassifier = watson.natural_language_classifier(credentialsNLC);

// Create the service wrapper
var dialog = watson.dialog(credentialsDialog);

var credentialsCloudant = extend({
	url : '<url>',
	username: '<username>',
	password: '<password>'
}, bluemix.getServiceCreds('cloudantNoSQLDB'));

var cloudant = Cloudant({account:credentialsCloudant.username, password:credentialsCloudant.password});

var dialog_id = process.env.DIALOG_ID || "<dialog_id>";
var classifier_id = process.env.CLASSIFIER_ID || "<classifier_id>";

// Interface configuration
var interfaceConfig = { bannerColor : { value : 'white', name : "bannerColor" },
						bannerURL : { value : 'http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud', name : "bannerURL" },
						bannerDescription : { value : 'WATSON DIALOG', name : "bannerDescription" },
						bannerDescriptionColor : { value : 'blue', name : "bannerDescriptionColor" },
						bannerDescriptionURL : { value : 'http://www.ibm.com/smarterplanet/us/en/ibmwatson/developercloud', name : "bannerDescriptionURL" },
						avatarBackgroundColor : { value : "white", name : "avatarBackgroundColor" },
						avatarBorderColor : { value : "blue", name : "avatarBorderColor" },
						title : { value : "Watson Dialog", name : "title" } };
						
var interfaceImages = { backgroundImage : { value : "", path : "public/images/background.jpg" },
						bannerImage : { value : "", path : "public/images/banner.png" },
						avatarImage : { value : "", path : "public/images/avatar-watson.png" },
						tabImage : { value : "", path : "public/images/favicon.ico" } };

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
		interfaceConfig.bannerColor.value = req.body.watsonBannerColor;
	if (req.body.watsonBannerURL != '')
		interfaceConfig.bannerURL.value = req.body.watsonBannerURL;
	if (req.body.watsonBannerDescription != '')
		interfaceConfig.bannerDescription.value = req.body.watsonBannerDescription;
	if (req.body.watsonBannerDescriptionColor != '')
		interfaceConfig.bannerDescriptionColor.value = req.body.watsonBannerDescriptionColor;
	if (req.body.watsonBannerDescriptionURL != '')
		interfaceConfig.bannerDescriptionURL.value = req.body.watsonBannerDescriptionURL;
	if (req.body.watsonBackgroundColor != '')
		interfaceConfig.avatarBackgroundColor.value = req.body.watsonBackgroundColor;
	if (req.body.watsonBorderColor != '')
		interfaceConfig.avatarBorderColor.value = req.body.watsonBorderColor;
	if (req.body.tabName != '')
		interfaceConfig.title.value = req.body.tabName;

	storeIDs();
	readImages();
	storeConfig();
	
	res.send('Updated');
});

app.get('/getConfig', function(req, res) {
	res.json({ bannerColor: interfaceConfig.bannerColor.value, bannerURL: interfaceConfig.bannerURL.value, 
			   bannerDescription: interfaceConfig.bannerDescription.value,
			   bannerDescriptionColor: interfaceConfig.bannerDescriptionColor.value,
			   bannerDescriptionURL: interfaceConfig.bannerDescriptionURL.value,
			   avatarBackgroundColor: interfaceConfig.avatarBackgroundColor.value,
			   avatarBorderColor: interfaceConfig.avatarBorderColor.value, title: interfaceConfig.title.value });
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

function storeIDs() {
	cloudant.db.destroy('ids', function(err) {
		cloudant.db.create('ids', function() {
			var db = cloudant.db.use('ids')
			if (dialog_id != "<dialog_id>")
				db.insert({ value: dialog_id }, 'dialog_id', function(err, body, header) {
					if (err)
						return console.log('[ids.insert] ', err.message);
				});
			if (classifier_id != "<classifier_id>")
				db.insert({ value: classifier_id }, 'classifier_id', function(err, body, header) {
					if (err)
						return console.log('[ids.insert] ', err.message);
				});
		});
	});
}

function getIDs() {
	var db = cloudant.db.use("ids");
	db.get("dialog_id", function(err, data) {
		if (!err && dialog_id == "<dialog_id>")
			dialog_id = data.value;
	});
	db.get("classifier_id", function(err, data) {
		if (!err && classifier_id == "<classifier_id>")
			classifier_id = data.value;
	});
}

function storeConfig() {
	cloudant.db.destroy('config', function(err) {
		cloudant.db.create('config', function() {
			var db = cloudant.db.use('config');
			db.insert({ value: interfaceConfig }, 'interfaceConfig', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
			db.insert({ value: interfaceImages.backgroundImage.value, type: "image/jpg" }, 'backgroundImage', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
			db.insert({ value: interfaceImages.bannerImage.value, type: "image/png" }, 'bannerImage', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
			db.insert({ value: interfaceImages.avatarImage.value, type: "image/png" }, 'avatarImage', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
			db.insert({ value: interfaceImages.tabImage.value, type: "image/x-icon" }, 'tabImage', function(err, body, header) {
				if (err)
					return console.log('[config.insert] ', err.message);
			});
		});
	});
}

function getConfig() {
	var db = cloudant.db.use("config");
	db.get('interfaceConfig', function(err, data) {
		if (!err)
			interfaceConfig = data.value;
	});
	db.get('backgroundImage', function(err, data) {
		if (!err) {
			interfaceImages.backgroundImage.value = new Buffer(data.value.data);
			fs.writeFile(interfaceImages.backgroundImage.path, interfaceImages.backgroundImage.value, function(err) {
				if (err)
					throw err;
			});
		}
	});
	db.get('bannerImage', function(err, data) {
		if (!err) {
			interfaceImages.bannerImage.value = new Buffer(data.value.data);
			fs.writeFile(interfaceImages.bannerImage.path, interfaceImages.bannerImage.value, function(err) {
				if (err)
					throw err;
			});
		}
	});
	db.get('avatarImage', function(err, data) {
		if (!err) {
			interfaceImages.avatarImage.value = new Buffer(data.value.data);
				fs.writeFile(interfaceImages.avatarImage.path, interfaceImages.avatarImage.value, function(err) {
					if (err)
						throw err;
				});
		}
	});
	db.get('tabImage', function(err, data) {
		if (!err) {
			interfaceImages.tabImage.value = new Buffer(data.value.data);
			fs.writeFile(interfaceImages.tabImage.path, interfaceImages.tabImage.value, function(err) {
				if (err)
					throw err;
			});
		}
	});
}

// Updates the value of the variable with the file
function readImages() {
	fs.readFile(interfaceImages.backgroundImage.path, function(err, data) {
		if (err)
			throw err;
		interfaceImages.backgroundImage.value = data;
	});
	fs.readFile(interfaceImages.bannerImage.path, function(err, data) {
		if (err)
			throw err;
		interfaceImages.bannerImage.value = data;
	});
	fs.readFile(interfaceImages.avatarImage.path, function(err, data) {
		if (err)
			throw err;
		interfaceImages.avatarImage.value = data;
	});
	fs.readFile(interfaceImages.tabImage.path, function(err, data) {
		if (err)
			throw err;
		interfaceImages.tabImage.value = data;
	});
}

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);

// Enviroment variables override Cloudant
getIDs();
storeIDs();

// Cloudant interface configuration overrides default
readImages();
getConfig();