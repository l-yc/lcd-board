const gulp = require('gulp');
const sass = require('gulp-dart-sass');
const ts = require('gulp-typescript');
const webpack = require('webpack-stream');

/** Builds **/
gulp.task('styles', function() {
  return gulp.src('./src/public/sass/**/*.scss')
    .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
    .pipe(gulp.dest('./dist/public/css/'));
});

gulp.task('scripts', function () {
  const tsProject = ts.createProject('./tsconfig.json');
  return gulp.src(['./src/public/js/**/*.ts', '!./src/public/js/lib/**/*'])
    //.pipe(tsProject())
    //.js
    .pipe(webpack(require('./webpack.config.js')))
    .pipe(gulp.dest('./dist/public/js/'));
});

gulp.task('scripts', function () {
  const tsProject = ts.createProject('./tsconfig.json');
  return gulp.src(['./src/public/js/**/*.ts', '!./src/public/js/lib/**/*'])
    //.pipe(tsProject())
    //.js
    .pipe(webpack(require('./webpack-dev.config.js')))
    .pipe(gulp.dest('./dist/public/js/'));
});


gulp.task('main', function () {
  const tsProject = ts.createProject('./tsconfig.json');
  return gulp.src(['./src/**/*.ts', '!./src/public/js/**/*.ts'])
    .pipe(tsProject())
    .pipe(gulp.dest('./dist/'));
});

/** Copiers **/
gulp.task('libs', function() {
  return gulp.src('./node_modules/paper/dist/paper-full.min.js')
    .pipe(gulp.dest('./dist/public/js/lib/'));
});

gulp.task('views', function() {
  return gulp.src('./src/views/**/*')
    .pipe(gulp.dest('./dist/views/'));
});

gulp.task('assets', function() {
  return gulp.src('./src/public/assets/**/*')
    .pipe(gulp.dest('./dist/assets/'));
});

/** Build **/
gulp.task('build', gulp.parallel('styles', 'libs', 'scripts', 'views', 'assets', 'main'));

/** Watch **/
gulp.task('watch styles', function() {
  return gulp.watch('./src/public/sass/**/*.scss', gulp.series('styles'))
});

//gulp.task('watch scripts', function() {
//  return gulp.watch(['./src/public/js/**/*.ts', '!./src/public/js/lib/**/*'], gulp.series('scripts'));
//});
gulp.task('watch scripts', function () {
  const tsProject = ts.createProject('./tsconfig.json');
  return gulp.src(['./src/public/js/**/*.ts', '!./src/public/js/lib/**/*'])
    //.pipe(tsProject())
    //.js
    .pipe(webpack(require('./webpack-dev-watch.config.js')))
    .pipe(gulp.dest('./dist/public/js/'));
});

gulp.task('watch views', function() {
  return gulp.watch('./src/views/**/*', gulp.series('views'))
});

gulp.task('watch assets', function() {
  return gulp.watch('./src/public/assets/**/*', gulp.series('assets'))
});

gulp.task('watch main', function() {
  return gulp.watch(['./src/**/*.ts', '!./src/public/js/**/*.ts'], gulp.series('main'));
});

gulp.task('watch', gulp.parallel(
  'watch styles',
  'watch scripts',
  'watch views',
  'watch assets',
  'watch main'
));

/** Default **/
gulp.task('default', gulp.series('build', 'watch'));
