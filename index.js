const SerialPort = require('serialport');
//const Spline = require('cubic-spline'); //nah
const Interpolator = require('spline-interpolator');

var comPorts, serial, inputDeviceInfos; //serial stuff
var audioStream, audioCtx, analyser, source; //audio stuff
var jous, osc1, osc2; //animation stuff

window.onload = () => {
	scanPorts();
	scanAudioInputs();
	attachElements();
};

function attachElements(){
	document.getElementById('scan').onclick = scanPorts;
	document.getElementById('connect').onclick = connectSerial;
	document.getElementById('scanAudio').onclick = scanAudioInputs;
	document.getElementById('useAudio').onclick = connectAudio;
}

function scanPorts(){
	document.getElementById('connect').disabled = true;
	document.getElementById('connect').innerHTML = 'Connect';
	document.getElementById('scan').disabled = false;
	document.getElementById('serialSelect').disabled = false;
	SerialPort.list((err, ports) => {
		if(err){
			console.log(err);
		}else{
			let list = [];
			if(ports.length){
				for(let item of ports){
					list.push(item.comName);
				}
			}
			comPorts = list;
			updatePortsSelect(comPorts);
		}
	});
};

function updatePortsSelect(list){ //takes an array of comNames
	let inner = '';
	for(var item of list){
		inner += '<option value="' + item + '">' + item + '</option>\n';
	}
	document.getElementById('serialSelect').innerHTML = inner;
	if(list.length){
		document.getElementById('connect').disabled = false;
	}
};

function connectSerial(){
	if(serial && serial.isOpen()){
		disconnectSerial();
		return;
	}
	let s = document.getElementById('serialSelect');
	serial = new SerialPort(s.options[s.selectedIndex].value, {
		baudRate: 115200
	});
	setupSerial();
	s.disabled = true;
	document.getElementById('connect').disabled = true;
	document.getElementById('connect').innerHTML = 'Connecting...';
	document.getElementById('scan').disabled = true;
};

function setupSerial(){
	serial.on('open', () => {
		console.log('serial opened');
		document.getElementById('connect').disabled = false;
		document.getElementById('connect').innerHTML = 'Disconnect';
	});

	serial.on('error', (e) => {
		if(serial.isOpen()){
			serial.close((e) => {
				console.log('error: ' + e);
			});
		}
	});

	serial.on('disconnect', (e) => {
		console.log('serial disconnected');
		if(e) console.log(e);
	});

	serial.on('close', (e) => {
		console.log('serial closed');
		if(e) console.log(e);
		scanPorts();
		serial = null;
	});

	serial.on('data', (data) => {
		console.log('data: ' + data);
	});
}

function disconnectSerial(){
	serial.close();
}

function scanAudioInputs(){
	inputDeviceInfos = [];
	document.getElementById('useAudio').disabled = true;
	document.getElementById('useAudio').innerHTML = 'Use';
	document.getElementById('scanAudio').disabled = false;
	document.getElementById('audioSelect').disabled = false;
	navigator.mediaDevices.enumerateDevices().then((devices) => {
		for(var device of devices){
			if(device.kind == 'audioinput'){
				console.log(device.label);
				inputDeviceInfos.push(device);
			}
		}
		updateAudioSelect(inputDeviceInfos);
	});
}

function updateAudioSelect(list){ //takes an array of comNames
	let inner = '';
	for(var item of list){
		inner += '<option value="' + item.deviceId + '">' + item.label + '</option>\n';
	}
	console.log(inner);
	document.getElementById('audioSelect').innerHTML = inner;
	if(list.length){
		document.getElementById('useAudio').disabled = false;
	}
}

function connectAudio(){
	if(audioCtx){
		disconnectAudio();
		return;
	}
	let s = document.getElementById('audioSelect');
	let constraints = {
		audio: {deviceId: {exact: s.options[s.selectedIndex].value}}
	};
	navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
		audioStream = stream;
		setupAudio();
		s.disabled = true;
		document.getElementById('useAudio').innerHTML = 'Unuse';
		document.getElementById('scanAudio').disabled = true;
	}).catch((reason) => {
		console.log('navigator.getUserMedia error: ', reason);
	});
}

function setupAudio(){
	audioCtx = new window.AudioContext();
	analyser = audioCtx.createAnalyser();
	source = audioCtx.createMediaStreamSource(audioStream);
	source.connect(analyser);
	analyser.fftSize = 2048;
	analyser.smoothingTimeConstant = 0.2;
	analyser.minDecibels = -80;
	analyser.maxDecibels = -0;
	startVisualizations();
	audioCtx.onstatechange = () => {
		if(audioCtx.state == 'closed') audioCtx = null;
	};
}

function disconnectAudio(){
	window.cancelAnimationFrame(sAnimation);
	window.cancelAnimationFrame(wAnimation);
	window.cancelAnimationFrame(lAnimation);
	window.cancelAnimationFrame(pAnimation);
	if (audioStream) {
		audioStream.getTracks().forEach(function(track) {
			track.stop();
		});
	}
	scanAudioInputs();
}

function startVisualizations(){
	visualizeWaveform(document.getElementById('waveform'));
	visualizeSpectrum(document.getElementById('spectrum'));
	visualizeLog(document.getElementById('log'), 2, 4);
	visualizeCSplineRGB(document.getElementById('pixel'), 0, 300, 3000, 22000, 64, true, 2);
}

function visualizeSpectrum(canvas){
	let ctx = canvas.getContext('2d');
	let w = canvas.width;
	let h = canvas.height;
	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	ctx.clearRect(0, 0, w, h);

	function draw(){
		sAnimation = window.requestAnimationFrame(draw);
		analyser.getByteFrequencyData(dataArray);

		// ctx.fillStyle = '#ccc';
		// ctx.fillRect(0, 0, w, h);

		ctx.clearRect(0, 0, w, h);

		ctx.fillStyle = '#f35';
		let scale = w/bufferLength;
		ctx.fillRect(10/22050*bufferLength*scale, 0, 1, h);
		ctx.fillRect(100/22050*bufferLength*scale, 0, 1, h);
		ctx.fillRect(1000/22050*bufferLength*scale, 0, 1, h);
		ctx.fillRect(10000/22050*bufferLength*scale, 0, 1, h);

		// ctx.fillStyle = '#000';
		ctx.fillStyle = '#ccc';
		let sliceWidth = w*1.00/bufferLength;
		for(let i = 0; i < bufferLength; i++){
			ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*dataArray[i]/255.00);
		}
	}

	draw();
}

function visualizeWaveform(canvas){
	let ctx = canvas.getContext('2d');
	let w = canvas.width;
	let h = canvas.height;
	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	ctx.clearRect(0, 0, w, h);

	function draw(){
		wAnimation = window.requestAnimationFrame(draw);
		analyser.getByteTimeDomainData(dataArray);

		// ctx.fillStyle = '#ccc';
		// ctx.fillRect(0, 0, w, h);
		ctx.clearRect(0, 0, w, h);

		ctx.lineWidth = 2;
		// ctx.strokeStyle = '#000';
		ctx.strokeStyle = 'rgb(215,218,223)';
		ctx.beginPath();
		let sliceWidth = w * 1.00 / bufferLength;
		let x = 0;
		for(var i = 0; i < bufferLength; i++) {
			var v = dataArray[i] / 128.0;
			var y = v * h/2;
			if(i == 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
			x += sliceWidth;
		}
		ctx.lineTo(canvas.width, canvas.height/2);
		ctx.stroke();
	}

	draw();
}

function visualizeLog(canvas, pwrx, pwry){
	let ctx = canvas.getContext('2d');
	let w = canvas.width;
	let h = canvas.height;
	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	ctx.clearRect(0, 0, w, h);

	function draw(){
		lAnimation = window.requestAnimationFrame(draw);
		analyser.getByteFrequencyData(dataArray);
		dataArray = normalizeLog(dataArray, pwrx, pwry);

		// ctx.fillStyle = '#ccc';
		// ctx.fillRect(0, 0, w, h);

		ctx.clearRect(0, 0, w, h);

		ctx.fillStyle = '#f35';
		let scale = w/bufferLength;
		let logscale = 1/bufferLength;
		ctx.fillRect(Math.pow(10/22050, 1/pwrx)*w, 0, 1, h);
		ctx.fillRect(Math.pow(100/22050, 1/pwrx)*w, 0, 1, h);
		ctx.fillRect(Math.pow(1000/22050, 1/pwrx)*w, 0, 1, h);
		ctx.fillRect(Math.pow(10000/22050, 1/pwrx)*w, 0, 1, h);

		// ctx.fillStyle = '#000';
		ctx.fillStyle = '#ccc';
		let sliceWidth = w*1.00/bufferLength;
		for(let i = 0; i < bufferLength; i++){
			ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*dataArray[i]/255.00);
		}
	}

	draw();
}

function visualizeCSplineRGB(canvas, cutL, cut1, cut2, cutH, leds = 0, log = false, pwr = 2){
	let ctx = canvas.getContext('2d');
	let w = canvas.width;
	let h = canvas.height;
	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	let nyquist = audioCtx.sampleRate / 2;
	if(cutH>22000)cutH=22000;
	cutL = Math.ceil(cutL*bufferLength/nyquist);
	cutH = Math.ceil(cutH*bufferLength/nyquist);
	cut1 = Math.ceil(cut1*bufferLength/nyquist); //convert hz to bin#
	cut2 = Math.ceil(cut2*bufferLength/nyquist); //convert hz to bin#
	let arrR, arrG, arrB;
	if(leds){
		arrR = new Uint8ClampedArray(leds);
		arrG = new Uint8ClampedArray(leds);
		arrB = new Uint8ClampedArray(leds);
	}else{
		arrR = new Uint8ClampedArray(w);
		arrG = new Uint8ClampedArray(w);
		arrB = new Uint8ClampedArray(w);
	}
	ctx.clearRect(0, 0, w, h);

	function draw(){
		pAnimation = window.requestAnimationFrame(draw);
		analyser.getByteFrequencyData(dataArray);
		cSplineInterpolate(arrR, dataArray.slice(cutL, cut1-1), log, pwr);
		cSplineInterpolate(arrG, dataArray.slice(cut1, cut2-1), log, pwr);
		cSplineInterpolate(arrB, dataArray.slice(cut2, cutH-1), log, pwr);
		ctx.globalCompositeOperation = 'source-over';
		// ctx.fillStyle = '#000';
		// ctx.fillRect(0, 0, w, h);
		ctx.clearRect(0, 0, w, h);

		ctx.globalCompositeOperation = 'lighten';
		if(leds){
			ctx.fillStyle = '#c00';
			let sliceWidth = w*1.00/arrR.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#f00';
			ctx.beginPath();
			let x = 0;
			let lasty = 0;
			for(let i = 0; i < arrR.length; i++){
				let y = h - arrR[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					//ctx.lineTo(x, lasty);
					//ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrR[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#0c0';
			sliceWidth = w*1.00/arrG.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#0f0';
			ctx.beginPath();
			x = 0;
			lasty = 0;
			for(let i = 0; i < arrG.length; i++){
				let y = h - arrG[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					//ctx.lineTo(x, lasty);
					//ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrG[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#00c';
			sliceWidth = w*1.00/arrB.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#00f';
			ctx.beginPath();
			x = 0;
			lasty = 0;
			for(let i = 0; i < arrB.length; i++){
				let y = h - arrB[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					//ctx.lineTo(x, lasty);
					//ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrB[i]/255.00);
			}
			ctx.stroke();
		}else{
			ctx.fillStyle = '#c00';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#f00';
			for(let i = 0; i < arrR.length; i++){
				let y = h - arrR[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrR[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#0c0';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#0f0';
			for(let i = 0; i < arrG.length; i++){
				let y = h - arrG[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrG[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#00c';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#00f';
			for(let i = 0; i < arrB.length; i++){
				let y = h - arrB[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrB[i]/255.00);
			}
			ctx.stroke();
		}
	}

	draw();
}

function visualizeGaussianRGB(canvas, cut1, cut2, overlap, leds = 0){
	let ctx = canvas.getContext('2d');
	let w = canvas.width;
	let h = canvas.height;
	let bufferLength = analyser.frequencyBinCount;
	let dataArray = new Uint8Array(bufferLength);
	let nyquist = audioCtx.sampleRate / 2;
	cut1 = Math.ceil(cut1*bufferLength/nyquist); //convert hz to bin#
	cut2 = Math.ceil(cut2*bufferLength/nyquist); //convert hz to bin#
	let arrR, arrG, arrB;
	if(leds){
		arrR = new Uint8ClampedArray(leds);
		arrG = new Uint8ClampedArray(leds);
		arrB = new Uint8ClampedArray(leds);
	}else{
		arrR = new Uint8ClampedArray(w);
		arrG = new Uint8ClampedArray(w);
		arrB = new Uint8ClampedArray(w);
	}
	ctx.clearRect(0, 0, w, h);

	function draw(){
		pAnimation = window.requestAnimationFrame(draw);
		analyser.getByteFrequencyData(dataArray);
		spreadGaussian(arrR, dataArray.slice(0, cut1-1), overlap);
		spreadGaussian(arrG, dataArray.slice(cut1, cut2-1), overlap);
		spreadGaussian(arrB, dataArray.slice(cut2, bufferLength), overlap);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);

		ctx.globalCompositeOperation = 'lighten';
		if(leds){
			ctx.fillStyle = '#c00';
			let sliceWidth = w*1.00/arrR.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#f00';
			ctx.beginPath();
			let x = 0;
			let lasty = 0;
			for(let i = 0; i < arrR.length; i++){
				let y = h - arrR[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, lasty);
					ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrR[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#0c0';
			sliceWidth = w*1.00/arrG.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#0f0';
			ctx.beginPath();
			x = 0;
			lasty = 0;
			for(let i = 0; i < arrG.length; i++){
				let y = h - arrG[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, lasty);
					ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrG[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#00c';
			sliceWidth = w*1.00/arrB.length;
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#00f';
			ctx.beginPath();
			x = 0;
			lasty = 0;
			for(let i = 0; i < arrB.length; i++){
				let y = h - arrB[i]/255*h;
				if(i == 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, lasty);
					ctx.lineTo(x, y);
				}
				lasty = y;
				x += sliceWidth;
				ctx.fillRect(i*sliceWidth, h, sliceWidth, -h*arrB[i]/255.00);
			}
			ctx.stroke();
		}else{
			ctx.fillStyle = '#c00';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#f00';
			for(let i = 0; i < arrR.length; i++){
				let y = h - arrR[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrR[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#0c0';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#0f0';
			for(let i = 0; i < arrG.length; i++){
				let y = h - arrG[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrG[i]/255.00);
			}
			ctx.stroke();

			ctx.fillStyle = '#00c';
			ctx.lineWidth = 2;
			ctx.strokeStyle = '#00f';
			for(let i = 0; i < arrB.length; i++){
				let y = h - arrB[i]/255*h;
				if(i == 0) {
					ctx.moveTo(i, y);
					ctx.beginPath();
				} else {
					ctx.lineTo(i, y);
				}
				ctx.fillRect(i, h, 1, -h*arrB[i]/255.00);
			}
			ctx.stroke();
		}
	}

	draw();
}

function cSplineInterpolate(target, input, log = false, pwr = 2){
	let inputLength = input.length;
	let targetLength = target.length;
	let inputLocations = [];
	let targetLocations = [];
	let spaceBetween = (inputLength-1)/(targetLength-1);
	let scale = (inputLength-1) / Math.pow((inputLength-1), pwr);
	for(let i=0; i<inputLength; i++) inputLocations.push(i);
	const curve = new Interpolator(inputLocations, input);
	for(let i=0; i<targetLength; i++) targetLocations.push(i*spaceBetween);
	if(log){
		for(let i=0; i<targetLength; i++){
			target[i] = curve.interpolate(Math.pow(targetLocations[i], pwr)*scale);
		}
	}else{
		for(let i=0; i<targetLength; i++){
			target[i] = curve.interpolate(targetLocations[i]);
		}
	}
}

function normalizeLog(array, xpow, ypow){
	let length = array.length - 1;
	let xscale = length/Math.pow(length, xpow);
	let yscale = 255/Math.pow(255, ypow);
	let result = new Uint8Array(length+1);
	for(let i = 0; i < result.length; i++){
		result[i] = Math.pow((array[Math.round(Math.pow(i, xpow)*xscale)]), ypow)*yscale;
	}
	return result;
}

function spreadGaussian(target, input, crossover = 1){
	let inputLength = input.length;
	let targetLength = target.length;
	let spaceBetween = targetLength/(inputLength-1);
	let inputLocations = [];
	for(let i=0; i<inputLength; i++){
		inputLocations.push(i*spaceBetween); //not entirely accurate
	}
	let tworoot2ln2 = 2*Math.sqrt(2*Math.LN2);
	let constC = crossover*spaceBetween/tworoot2ln2;
	let twoc2 = 2*Math.pow(constC, 2);
	for(let i=0; i<targetLength; i++){
		let magnitude = 0;
		for(let j=0; j<inputLength; j++){
			magnitude += input[j]*Math.exp(0- Math.pow(i-inputLocations[j], 2)/twoc2);
		}
		target[i]=(magnitude);
	}
}
