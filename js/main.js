// Global Audio Variables.
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var audioSource = null
var audioBuffer = null;
var audioAnalyser = null;

var sampleCtx = new (window.AudioContext || window.webkitAudioContext)();
var sampleSource = null;
var sampleBuffer = null;
var sampleAnalyser = null;
var samplePlayer = null;

const pianoSampler = new Tone.Sampler({
	urls: {
		C2: "piano_C2.wav",
		C3: "piano_C3.wav",
		C4: "piano_C4.wav",
		C5: "piano_C5.wav",
	},
	baseUrl: "/media/"
}).toDestination();

var toneOsc;


// Global Variables
var isStopped = true;
var notesArray;
var notesDict = {};
var sampleFreq = -1;


// Buttons
var playButton = $('#playButton')[0];
var stopButton = $('#stopButton')[0];
var hjonkButton = $('#hjonkButton')[0];


// Event Handlers
$('#playButton').click(playSound);
$('#stopButton').click(stopSound);

$('#hjonkButton').click(function() {
	playSample(sampleFreq);
});

$('.key').click(function() {
	let note = this.id;
	let freq = notesDict[this.id];
	
	if (sampleBuffer) {
		playSample(freq);
	}
	else {
		pianoSampler.triggerAttack(note);
	}
});


// Load notes array.
$.getJSON('/misc/notes.json', function (data) {
	notesArray = data["440"];
	for (let i = 0; i < notesArray.length; i++) {
		notesDict[notesArray[i].note] = notesArray[i].frequency;
	}
});

// Load/buffer user-uploaded audio file.
$('#audioInput').change(function() {
	if (this.files[0] == undefined) {
		console.log("Upload a file!");
		return false;
	}
	
	playButton.disabled = true;
	stopButton.disabled = true;
	
	let reader = new FileReader();
	reader.onload = function () {		
		audioCtx.decodeAudioData(this.result).then(function (buffer) {
			// Store audioBuffer for later use.
			audioBuffer = buffer;
			playButton.disabled = false;
			stopButton.disabled = false;
		}, function (err) {
			console.log('Error decoding audio file: ', err);
		});
	};
	reader.readAsArrayBuffer(this.files[0]);
});

// Load/buffer user-uploaded sample file.
$('#sampleInput').change(function() {
	if (this.files[0] == undefined) {
		console.log("Upload a file!");
		return false;
	}
	
	hjonkButton.disabled = true;
	
	let reader = new FileReader();
	reader.onload = function () {		
		sampleCtx.decodeAudioData(this.result).then(function (buffer) {
			// Store sample buffer for repeated use.
			sampleBuffer = new AudioBuffer({
				sampleRate: buffer.sampleRate,
				length: Math.min(buffer.sampleRate, buffer.length),
				numberOfChannels: buffer.numberOfChannels
			});
			
			// Truncate input to 1 second.
			for (let i = 0; i < buffer.numberOfChannels; i++) {
				let inputData = buffer.getChannelData(i);
				let sampleData = sampleBuffer.getChannelData(i);
				
				for (let j = 0; j < sampleData.length; j++) {
					sampleData[j] = inputData[j];
				}
			}
			
			// Try to detect pitch of sample.
			sampleSource = sampleCtx.createBufferSource();
			sampleSource.buffer = sampleBuffer;

			sampleAnalyser = sampleCtx.createAnalyser();
			sampleAnalyser.fftSize = 2048;
			sampleSource.connect(sampleAnalyser);
			sampleSource.start(0);

			sampleFreq = getSamplePitch(sampleCtx.currentTime + 1.0, []);
			if (sampleFreq <= 0) {
				alert("Could not detect the pitch of the sample file. Please try uploading a different file.");
			} else {
				console.log(sampleFreq);
				hjonkButton.disabled = false;
			}			
		}, function (err) {
			console.log('Error decoding sample file: ', err);
		});
	};
	reader.readAsArrayBuffer(this.files[0]);
});


function playSound() {
	if (isStopped) {
		// Currently stopped.
		audioSource = audioCtx.createBufferSource();
		audioSource.buffer = audioBuffer;
		audioSource.loop = false;
		
		audioAnalyser = audioCtx.createAnalyser();
		audioAnalyser.fftSize = 2048;
		audioSource.connect(audioAnalyser).connect(audioCtx.destination);
		
		audioSource.start(0);
		
		isStopped = false;
		playButton.textContent = 'Pause';
		
		detectPitch(-1);
	}
	else {
		// Currently playing/paused.
		if(audioCtx.state === 'running') {
			audioCtx.suspend().then(function() {
				playButton.textContent = 'Play';
			});
		} else if (audioCtx.state === 'suspended') {
			audioCtx.resume().then(function() {
				playButton.textContent = 'Pause';
			});  
		}
	}
}

function stopSound() {
  if (audioSource) {
    audioSource.stop(0);
		isStopped = true;
		playButton.textContent = 'Play';
  }
}

function playSample(pitch) {
	if (sampleFreq <= 0) {
		console.log("Could not detect the pitch of the sample file.");
		return;
	}
	
	samplePlayer = new Tone.GrainPlayer(sampleBuffer).toDestination();
	samplePlayer.detune = findCentsBetween(sampleFreq, pitch);
	samplePlayer.start();
	// TODO: Add gain node.
}

function playTone(pitch) {
	toneOsc = new Tone.Oscillator({
		frequency: pitch,
		volume: -10
	}).toDestination();
	
	toneOsc.start();
	toneOsc.stop("+0.5");
}

// Repeatedly detects pitch of audio file, updates labels, and accompanies the audio file in realtime.
function detectPitch(prevFreq) {
	let buffer = new Uint8Array(audioAnalyser.fftSize);
	audioAnalyser.getByteTimeDomainData(buffer);

	let fundamentalFreq = findFundamentalFreq(buffer, audioCtx.sampleRate);

	if (fundamentalFreq !== -1 && fundamentalFreq != 5512.5) {
		let note = findClosestNote(fundamentalFreq, notesArray);
		console.log(note.note, fundamentalFreq);
		
		$('#freqLabel').html(fundamentalFreq);
		$('#noteLabel').html(note.note);
		
		if (Math.abs(fundamentalFreq - prevFreq) > prevFreq * 0.002) {
			if (sampleBuffer && sampleFreq > 0) {
				playSample(fundamentalFreq);
			}
			else {
				playTone(fundamentalFreq);
			}			
		}
	}
	else {
		$('#freqLabel').html('---');
		$('#noteLabel').html('---');
	}
	
	// TODO: Add terminating condition.
	window.requestAnimationFrame(function() {
		detectPitch(fundamentalFreq);
	});
}

// Finds the average of detected frequencies in the sample file.
function getSamplePitch(endTime, freqs) {
	let buffer = new Uint8Array(sampleAnalyser.fftSize);
	sampleAnalyser.getByteTimeDomainData(buffer);
	
	let fundamentalFreq = findFundamentalFreq(buffer, sampleCtx.sampleRate);
	
	if (fundamentalFreq !== -1 && fundamentalFreq != 5512.5) {
		freqs.push(/*+*/fundamentalFreq/*.toFixed(2)*/);
	}
	
	if (sampleCtx.currentTime < endTime) {
		return getSamplePitch(endTime, freqs);
	} else if (freqs.length > 0) {
		let average = freqs.reduce((acc, curr) => acc + curr) / freqs.length;
		return average;
		
		/*let mode = freqs.sort((a,b) =>
          freqs.filter(v => v===a).length
        - freqs.filter(v => v===b).length
    ).pop();*/
	} else {
		return -1;
	}
}

// Find the fundamental frequency with autocorrelation.
// https://pages.mtu.edu/~suits/autocorrelation.html
function findFundamentalFreq(buffer, sampleRate) {
	let n = 1024;        // number of products to accumulate per tau
	let bestR = 0;       // best autocorrelation
	let bestTau = -1;    // best period (in frames)
	
	for (let tau = 8; tau <= 1000; tau++) {
		let r = 0;
		
		for (let i = 0; i < n; i++) {
			r += ((buffer[i] - 128) / 128) * ((buffer[i + tau] - 128) / 128);
		}
		r /= (n + tau);

		if (r > bestR) {
			bestR = r;
			bestTau = tau;
			if (r > 0.9) {
				break;
			}
		}
	}

	if (bestR > 0.0025) {
		// Return fundamental frequency.
		return sampleRate / bestTau;
	}
	else {
		// Weak correlation.
		return -1;
	}
};

// Find the closest note to freq with binary search.
function findClosestNote(freq, notes) {
	let l = 0, r = notes.length - 1;
	
	while (l <= r) {
		let m = Math.floor((l + r) / 2);
		
		if (notes[m].frequency < freq) {
			l = m + 1;
		} else if (notes[m].frequency > freq) {
			r = m - 1;
		} else {
			return notes[m];
		}
	}

	if (Math.abs(notes[r].frequency - freq) < Math.abs(notes[l].frequency - freq)) {
		return notes[r];
	}
	return notes[l];
};

// Find cents between freq1 and freq2.
function findCentsBetween (freq1, freq2) {
	var log2 = 0.6931471805599453; // Math.log(2)
	return 1200 * (Math.log(freq2 / freq1) / log2);
};
