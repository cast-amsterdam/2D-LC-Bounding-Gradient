function generate_shifting_reference()
root = fileparts(fileparts(fileparts(mfilename('fullpath'))));
sourceFile = fullfile(root, 'public', 'example', 'MixTest.xlsx');
fixtureDir = fullfile(root, 'tests', 'fixtures');

data = readmatrix(sourceFile);
rt2 = data(2:end, 1);
rt1 = data(1, 2:end);
chrom2d = data(2:end, 2:end);

dwell1D = 0.225;
dead1D = 0.265;
flow1D = 0.032;
dwell2D = 0.07;
dead2D = 1.47;
flow2D = 2;
t01D = dead1D / flow1D;
t02D = dead2D / flow2D;
td1D = dwell1D / flow1D;
td2D = dwell2D / flow2D;
grad1d = [0 5; 1 5; 20 100];
grad2d = [0 5; 0.16 5; 0.8 100];

[~, tflip] = min(abs(rt2 - t02D));
chrom2dplot = [chrom2d(tflip+1:end, :); chrom2d(1:tflip, 2:end) zeros(tflip, 1)];
[~, t1Dcut] = min(abs(rt1 - t01D));
detection = [chrom2dplot(:, t1Dcut:end) zeros(size(chrom2dplot, 1), t1Dcut-1)];
detection(rt2 < max(rt2) - t02D, :) = 0;
normalized = detection ./ max(detection, [], 'all');
normalized(normalized < 0) = 0;
mask = imbinarize(normalized .^ 1.5);
[row, col] = find(mask > 0, inf);
hullIndices = boundary(col, row, 0);
gradientCoordinates = [rt1(col(hullIndices))' + td1D, rt2(row(hullIndices))];

% Exact Shifting Gradient branch from BoundingGradientApp.mlapp.
x = gradientCoordinates(:, 1);
isChange = [true; diff(x) ~= 0; true];
indices = find(isChange);
keepIndices = unique([indices(1:end-1), indices(2:end)-1]);
gradientCoordinates = gradientCoordinates(keepIndices, :);

time1DOpt = sort(unique(gradientCoordinates(:, 1) - td1D - t01D));
time1DOpt(time1DOpt < 0) = 0;
time1DOpt = unique(time1DOpt);
time1DOpt = [time1DOpt(1); time1DOpt(end)];
grad1dExtended = [grad1d; max(rt1) grad1d(end, end)];
grad1DTimepoint = sort([grad1dExtended(1:sum(grad1dExtended(:, 1) < max(time1DOpt)), 1); time1DOpt]);
while any(grad1DTimepoint(2:end) < grad1dExtended(2, 1))
    grad1DTimepoint = [grad1DTimepoint(1); grad1DTimepoint(3:end)];
end
grad1DPhis = time1DPhi(grad1DTimepoint + td1D + t01D, grad1d, max(rt1), td1D, t01D);
if numel(grad1DTimepoint) == 4 && grad1DPhis(end-1) == grad1DPhis(end) && grad1DPhis(1) == grad1DPhis(2)
    grad1DTimepoint(3:end) = grad1DTimepoint(3:end) ./ max(grad1DTimepoint) .* max(rt1);
elseif numel(grad1DTimepoint) > 3 && (grad1DPhis(end-1) < grad1DPhis(end) || grad1DPhis(3) > grad1DPhis(2))
    grad1DTimepoint(4:end) = (grad1DTimepoint(4:end) - grad1DTimepoint(3)) ./ max(grad1DTimepoint) .* max(rt1);
    grad1DTimepoint(3) = grad1DTimepoint(2) + 0.01;
else
    grad1DTimepoint(3:end) = grad1DTimepoint(3:end) ./ max(grad1DTimepoint) .* max(rt1);
end
optimized1D = [grad1DTimepoint, grad1DPhis];

splitIndex = find(diff(gradientCoordinates(:, 1)) <= 0, 1, 'first');
roiTimeStart = gradientCoordinates(1:splitIndex, 1);
roiPhiStart = gradientCoordinates(1:splitIndex, 2) .* 100;
roiTimeEnd = gradientCoordinates(splitIndex+1:end, 1);
roiPhiEnd = gradientCoordinates(splitIndex+1:end, 2) .* 100;
roiTimeStart(end+1) = roiTimeEnd(end);
roiPhiStart(end+1) = roiPhiEnd(end);
roiTimeEnd(end) = [];
roiPhiEnd(end) = [];
[roiTimeStart, uniqueIndices] = unique(roiTimeStart);
roiPhiStart = roiPhiStart(uniqueIndices);
[roiTimeEnd(end+1), minimumIndex] = min(roiTimeStart);
roiPhiEnd(end+1) = roiPhiStart(minimumIndex);
roiTimeStart = rescale(roiTimeStart, grad1d(2, 1) + t01D, max(rt1));
roiTimeEnd = rescale(roiTimeEnd, grad1d(2, 1) + t01D, max(rt1));
[roiTimeEnd, uniqueIndices] = unique(roiTimeEnd);
roiPhiEnd = roiPhiEnd(uniqueIndices);

maxLength = max(length(roiTimeStart), length(roiTimeEnd));
optimized2D = nan(maxLength, 4);
optimized2D(1:length(roiTimeStart), 1) = roiTimeStart;
optimized2D(1:length(roiPhiStart), 2) = roiPhiStart;
optimized2D(1:length(roiTimeEnd), 3) = roiTimeEnd;
optimized2D(1:length(roiPhiEnd), 4) = roiPhiEnd;

writematrix(gradientCoordinates, fullfile(fixtureDir, 'mix_test_shifting_roi.csv'));
writematrix(optimized1D, fullfile(fixtureDir, 'mix_test_shifting_optimized_1d.csv'));
writematrix(optimized2D, fullfile(fixtureDir, 'mix_test_shifting_optimized_2d.csv'));
fprintf('ROI rows: %d\n', size(gradientCoordinates, 1));
fprintf('Optimized 1D:\n'); disp(optimized1D);
fprintf('Optimized 2D:\n'); disp(optimized2D);

fprintf('Creating exact MATLAB Shifting Gradient prediction fixture...\n');
referenceFigure = figure('Visible', 'off');
referenceAxes = axes(referenceFigure);
imagesc(referenceAxes, rt1, rt2, chrom2dplot);
set(referenceAxes, 'YDir', 'normal');
referenceRoi = images.roi.Polygon(referenceAxes, 'Position', gradientCoordinates);
roiMask = createMask(referenceRoi);
close(referenceFigure);
maskFile = fopen(fullfile(fixtureDir, 'mix_test_shifting_mask.bin'), 'w');
fwrite(maskFile, roiMask, 'uint8');
fclose(maskFile);
fprintf('ROI mask values: %d\n', sum(roiMask, 'all'));

time1DMatrix = repmat(rt1, size(chrom2dplot, 1), 1);
time2DMatrix = repmat(rt2, 1, size(chrom2dplot, 2));
resizedDimensions = size(chrom2dplot);
resizedDimensions(1) = resizedDimensions(1) * 2;
resizedDimensions(2) = resizedDimensions(2) * 100;

selectedData = chrom2dplot;
selectedData(~roiMask) = nan;
selectedData = imresize(selectedData, resizedDimensions, 'bicubic');
selectedTime1D = time1DMatrix;
selectedTime1D(~roiMask) = nan;
selectedTime1D = imresize(selectedTime1D, resizedDimensions, 'bicubic');
selectedTime2D = time2DMatrix;
selectedTime2D(~roiMask) = nan;
selectedTime2D = imresize(selectedTime2D, resizedDimensions, 'bicubic');

for rowIndex = 1:size(selectedTime1D, 1)
    finite = ~isnan(selectedTime1D(rowIndex, :));
    selectedTime1D(rowIndex, finite) = rescale(selectedTime1D(rowIndex, finite), grad1d(2, 1) + t01D, max(rt1));
end
for columnIndex = 1:size(selectedTime2D, 2)
    finite = ~isnan(selectedTime2D(:, columnIndex));
    selectedTime2D(finite, columnIndex) = rescale(selectedTime2D(finite, columnIndex), grad2d(2, 1), max(rt2));
end

interpolateX = selectedTime1D(:);
finite = ~isnan(interpolateX);
scaledData = griddata(interpolateX(finite), selectedTime2D(finite), selectedData(finite), time1DMatrix, time2DMatrix, 'cubic');
predictionFile = fopen(fullfile(fixtureDir, 'mix_test_shifting_prediction.bin'), 'w');
fwrite(predictionFile, scaledData, 'double');
fclose(predictionFile);
fprintf('Prediction finite values: %d\n', sum(isfinite(scaledData), 'all'));
end

function phi = time1DPhi(time, gradient, maximumTime, dwellTime, deadTime)
extended = [gradient; maximumTime gradient(end, 2)];
sampleTime = time - dwellTime - deadTime;
phi = repmat(gradient(1, 2), size(time));
positive = sampleTime > 0;
phi(positive) = interp1(extended(:, 1), extended(:, 2), sampleTime(positive), 'linear');
end
