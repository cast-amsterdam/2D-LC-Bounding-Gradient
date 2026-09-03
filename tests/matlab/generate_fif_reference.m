function generate_fif_reference()
% Generate the FiF ROI mask and prediction directly from the corresponding
% BoundingGradientApp.mlapp calculation path.
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
dead2D = 1.47;
flow2D = 2;
t01D = dead1D / flow1D;
t02D = dead2D / flow2D;
td1D = dwell1D / flow1D;
grad1d = [0 5; 1 5; 20 100];
grad2d = [0 5; 0.16 5; 0.8 100];

[~, tflip] = min(abs(rt2 - t02D));
chrom2dplot = [chrom2d(tflip+1:end, :); chrom2d(1:tflip, 2:end) zeros(tflip, 1)];
[~, t1Dcut] = min(abs(rt1 - t01D));
detection = [chrom2dplot(:, t1Dcut:end) zeros(size(chrom2dplot, 1), t1Dcut-1)];
detection(rt2 < max(rt2) - t02D, :) = 0;
normalized = detection ./ max(detection, [], 'all');
normalized(normalized < 0) = 0;
detectionMask = imbinarize(normalized .^ 1.5);
[row, col] = find(detectionMask > 0, inf);
gradientCoordinates = [
    rt1(min(col)) + td1D, rt2(max(row));
    rt1(max(col)) + td1D, rt2(max(row));
    rt1(max(col)) + td1D, rt2(min(row));
    rt1(min(col)) + td1D, rt2(min(row));
    rt1(min(col)) + td1D, rt2(max(row))
];

referenceFigure = figure('Visible', 'off');
referenceAxes = axes(referenceFigure);
imagesc(referenceAxes, rt1, rt2, chrom2dplot);
set(referenceAxes, 'YDir', 'normal');
referenceRoi = images.roi.Polygon(referenceAxes, 'Position', gradientCoordinates);
roiMask = createMask(referenceRoi);
close(referenceFigure);

[roiRows, roiColumns] = find(roiMask);
rowRange = min(roiRows):max(roiRows);
columnRange = min(roiColumns):max(roiColumns);
selectedData = chrom2dplot(rowRange, columnRange);
time1DMatrix = repmat(rt1, size(chrom2dplot, 1), 1);
time2DMatrix = repmat(rt2, 1, size(chrom2dplot, 2));
selectedTime1D = time1DMatrix(rowRange, columnRange);
selectedTime2D = time2DMatrix(rowRange, columnRange);

for rowIndex = 1:size(selectedTime1D, 1)
    selectedTime1D(rowIndex, :) = rescale(selectedTime1D(rowIndex, :), grad1d(2, 1) + t01D, max(rt1));
end
for columnIndex = 1:size(selectedTime2D, 2)
    selectedTime2D(:, columnIndex) = rescale(selectedTime2D(:, columnIndex), grad2d(2, 1), max(rt2));
end

scaledData = griddata(selectedTime1D(:), selectedTime2D(:), selectedData(:), time1DMatrix, time2DMatrix, 'cubic');
maskFile = fopen(fullfile(fixtureDir, 'mix_test_fif_mask.bin'), 'w');
fwrite(maskFile, roiMask, 'uint8');
fclose(maskFile);
predictionFile = fopen(fullfile(fixtureDir, 'mix_test_fif_prediction.bin'), 'w');
fwrite(predictionFile, scaledData, 'double');
fclose(predictionFile);

fprintf('FiF ROI source rows: %d..%d, columns: %d..%d\n', min(roiRows), max(roiRows), min(roiColumns), max(roiColumns));
fprintf('FiF prediction finite values: %d\n', sum(isfinite(scaledData), 'all'));
end
