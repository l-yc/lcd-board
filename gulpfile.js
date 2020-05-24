let gulp = require('gulp');
let sass = require('gulp-sass');
let ts = require('gulp-typescript');

/** Builds **/
gulp.task('styles', function() {
  return gulp.src('./src/public/sass/**/*.scss')
    .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
    .pipe(gulp.dest('./dist/public/css/'));
});

gulp.task('libs', function() {
  return gulp.src('./node_modules/paper/dist/paper-full.min.js')
    .pipe(gulp.dest('./dist/public/js/lib/paper.min.js'));
});

gulp.task('main', function () {
  const tsProject = ts.createProject('./tsconfig.json');
  return tsProject.src()
    .pipe(tsProject())
    .pipe(gulp.dest('./dist/'));
});

gulp.task('build', function() {
  return gulp.parallel('styles', 'libs', 'scripts');
});

/** Watch **/
gulp.task('watch styles', function() {
  return gulp.watch('./src/public/sass/**/*.scss', gulp.series('styles'))
});

gulp.task('watch main', function() {
  return gulp.watch('./src/**/*.ts', gulp.series('main'));
});

gulp.task('watch', gulp.parallel(
  'watch styles',
  'watch main'
));

/** Default **/
gulp.task('default', gulp.series('watch'));
