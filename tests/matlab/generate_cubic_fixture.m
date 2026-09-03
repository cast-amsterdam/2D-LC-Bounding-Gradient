function generate_cubic_fixture(projectDir)
% Small deterministic reference for the browser port of griddata cubic.
x = [0; 1; 2; 0.2; 1.3; 1.9; 0.6; 1.5];
y = [0; 0.1; 0; 1; 0.8; 1.2; 1.9; 1.7];
v = sin(1.3*x) + cos(2.1*y) + 0.2*x.*y;
xq = linspace(0, 2, 21);
yq = linspace(0, 1.9, 20);
[Xq,Yq] = meshgrid(xq,yq);
Vq = griddata(x,y,v,Xq,Yq,'cubic');
writematrix([x,y,v], fullfile(projectDir,'tests','fixtures','cubic_samples.csv'));
writematrix(xq, fullfile(projectDir,'tests','fixtures','cubic_x.csv'));
writematrix(yq', fullfile(projectDir,'tests','fixtures','cubic_y.csv'));
writematrix(Vq, fullfile(projectDir,'tests','fixtures','cubic_reference.csv'));
end
